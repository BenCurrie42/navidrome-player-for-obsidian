import { SubsonicClient } from "./subsonic";
import { PersistedState, PlaybackMode, RadioStation, Track } from "./types";

/** Number of upcoming tracks below which random/vibes mode refills the queue. */
const REFILL_THRESHOLD = 5;
const REFILL_SIZE = 25;

type Listener = () => void;

/**
 * Plain-TS queue/playback store. Owns the HTML5 <audio> element and the queue;
 * both view tabs subscribe to `onChange` for structural updates (track, queue,
 * play state, mode, volume). High-frequency time updates are read directly off
 * `audio` by the UI, not broadcast here.
 */
export class Player {
	readonly audio: HTMLAudioElement;
	private prefetchAudio: HTMLAudioElement;

	queue: Track[] = [];
	index = -1;
	mode: PlaybackMode = "normal";

	private listeners = new Set<Listener>();
	private persistTimer: number | null = null;
	private refilling = false;

	constructor(
		private getClient: () => SubsonicClient | null,
		private persist: () => void,
		private onError: (message: string) => void
	) {
		this.audio = new Audio();
		this.audio.preload = "auto";
		this.prefetchAudio = new Audio();
		this.prefetchAudio.preload = "auto";

		this.audio.addEventListener("ended", () => this.handleEnded());
		this.audio.addEventListener("play", () => this.emitAndSchedule());
		this.audio.addEventListener("pause", () => this.emitAndSchedule());
		this.audio.addEventListener("playing", () => this.emit());
		this.audio.addEventListener("waiting", () => this.emit());
		this.audio.addEventListener("error", () => {
			if (this.current) {
				this.onError(`Playback failed for "${this.current.title}".`);
			}
		});
	}

	// --- subscription ------------------------------------------------------

	onChange(fn: Listener): () => void {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}

	private emit() {
		for (const fn of this.listeners) fn();
	}

	private emitAndSchedule() {
		this.emit();
		this.schedulePersist();
	}

	// --- derived state -----------------------------------------------------

	get current(): Track | null {
		return this.index >= 0 && this.index < this.queue.length
			? this.queue[this.index]
			: null;
	}

	get isPlaying(): boolean {
		return !this.audio.paused && !this.audio.ended;
	}

	get volume(): number {
		return this.audio.volume;
	}

	// --- queue control -----------------------------------------------------

	/** Replace the queue and start playing at `startIndex`. */
	loadQueue(tracks: Track[], startIndex = 0, autoplay = true) {
		if (tracks.length === 0) return;
		this.queue = tracks.slice();
		this.index = Math.min(Math.max(startIndex, 0), this.queue.length - 1);
		this.playCurrent(autoplay);
	}

	/** Load a single radio station as a one-item queue and start playing. */
	playRadio(station: RadioStation) {
		const track: Track = {
			id: station.id,
			title: station.name,
			streamUrl: station.streamUrl,
			isRadio: true,
			coverArt: undefined,
		};
		this.queue = [track];
		this.index = 0;
		this.playCurrent(true);
	}

	/** Append more tracks without disturbing playback (used by vibes refill). */
	append(tracks: Track[]) {
		this.queue.push(...tracks);
		this.emit();
		this.persist();
	}

	jumpTo(index: number) {
		if (index < 0 || index >= this.queue.length) return;
		this.index = index;
		this.playCurrent(true);
	}

	private playCurrent(autoplay: boolean) {
		const client = this.getClient();
		const track = this.current;
		if (!track) return;
		// Radio stations carry their own streamUrl; regular tracks need a client.
		if (track.streamUrl) {
			this.audio.src = track.streamUrl;
		} else {
			if (!client) return;
			this.audio.src = client.streamUrl(track.id);
		}
		this.audio.load();
		if (autoplay) {
			void this.audio.play().catch(() => {
				this.onError(`Could not start "${track.title}".`);
			});
		}
		// Skip prefetch and queue refill for radio — live streams have no "next".
		if (!track.isRadio) {
			this.prefetchNext();
		}
		this.emitAndSchedule();
	}

	/** Warm the connection for the next track so transitions feel snappy. */
	private prefetchNext() {
		const client = this.getClient();
		const next = this.queue[this.index + 1];
		if (!client || !next || next.isRadio) return;
		this.prefetchAudio.src = client.streamUrl(next.id);
		this.prefetchAudio.load();
	}

	// --- transport ---------------------------------------------------------

	play() {
		if (this.current) {
			void this.audio.play().catch(() => {});
		}
	}

	pause() {
		this.audio.pause();
	}

	togglePlay() {
		if (this.isPlaying) this.pause();
		else this.play();
	}

	next() {
		// Do not auto-advance off a radio station — a live stream ending is a dropout.
		if (this.current?.isRadio) return;
		if (this.index < this.queue.length - 1) {
			this.index++;
			this.playCurrent(true);
			void this.maybeRefill();
		} else {
			void this.maybeRefill(true);
		}
	}

	prev() {
		// Restart the current track if we're more than 3s in; otherwise step back.
		if (this.audio.currentTime > 3 || this.index === 0) {
			this.audio.currentTime = 0;
			return;
		}
		this.index--;
		this.playCurrent(true);
	}

	seek(seconds: number) {
		if (Number.isFinite(seconds)) this.audio.currentTime = seconds;
	}

	setVolume(v: number) {
		this.audio.volume = Math.min(Math.max(v, 0), 1);
		this.emitAndSchedule();
	}

	// --- modes -------------------------------------------------------------

	setMode(mode: PlaybackMode) {
		const wasRandom = this.mode === "random";
		this.mode = mode;
		this.emit();
		this.persist();
		// Seed a random tail (or a fresh random queue) the moment vibes is
		// switched on, rather than waiting for the queue to drain into
		// maybeRefill's threshold. Only fires on the off->on transition.
		if (mode === "random" && !wasRandom) void this.seedRandom();
	}

	/** IDs already present in the queue, so random pulls never stack duplicates. */
	private dedupAgainstQueue(songs: Track[]): Track[] {
		const existingIds = new Set(this.queue.map((t) => t.id));
		return songs.filter((t) => !existingIds.has(t.id));
	}

	/**
	 * Fired once when vibes is switched on. With nothing playing, fetches a
	 * random batch and starts playing it immediately. With a track already
	 * current, appends one dedup'd random batch to the end of the queue,
	 * leaving `index`/current playback/existing order untouched — maybeRefill
	 * takes over topping it up from there. Shares the `refilling` guard with
	 * maybeRefill so a rapid toggle or a simultaneous drain can't overlap.
	 */
	private async seedRandom() {
		if (this.refilling) return;
		// Vibes never seeds while a radio station is current.
		if (this.current?.isRadio) return;
		const client = this.getClient();
		if (!client) return;
		this.refilling = true;
		try {
			const songs = await client.getRandomSongs(REFILL_SIZE);
			const fresh = this.dedupAgainstQueue(songs);
			if (!fresh.length) return;
			if (!this.current) {
				this.loadQueue(fresh, 0, true);
			} else {
				this.queue.push(...fresh);
				this.emit();
				this.persist();
			}
		} catch (e) {
			this.onError(`Could not fetch random songs: ${(e as Error).message}`);
		} finally {
			this.refilling = false;
		}
	}

	/** Shuffle the queue, keeping the current track playing at the front. */
	shuffle() {
		if (this.queue.length < 2) return;
		const current = this.current;
		const rest = this.queue.filter((_, i) => i !== this.index);
		for (let i = rest.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[rest[i], rest[j]] = [rest[j], rest[i]];
		}
		this.queue = current ? [current, ...rest] : rest;
		this.index = current ? 0 : this.index;
		this.emit();
		this.persist();
	}

	private handleEnded() {
		if (this.current?.isRadio) {
			// A radio stream ending unexpectedly is a dropout, not a normal track end.
			this.onError(`Stream ended unexpectedly for "${this.current.title}".`);
			return;
		}
		this.next();
	}

	/**
	 * In random/vibes mode, top the queue up from the whole library when it
	 * drains. `force` advances into the freshly fetched songs if we were at the
	 * very end of the queue.
	 */
	private async maybeRefill(force = false) {
		if (this.mode !== "random" || this.refilling) return;
		// Vibes never refills while a radio station is current.
		if (this.current?.isRadio) return;
		const remaining = this.queue.length - this.index - 1;
		if (remaining >= REFILL_THRESHOLD && !force) return;

		const client = this.getClient();
		if (!client) return;
		this.refilling = true;
		try {
			const songs = await client.getRandomSongs(REFILL_SIZE);
			const fresh = this.dedupAgainstQueue(songs);
			if (fresh.length) {
				const wasAtEnd = this.index >= this.queue.length - 1;
				this.queue.push(...fresh);
				if (force && wasAtEnd) {
					this.index++;
					this.playCurrent(true);
				} else {
					this.emit();
					this.persist();
				}
			}
		} catch (e) {
			this.onError(`Could not fetch more songs: ${(e as Error).message}`);
		} finally {
			this.refilling = false;
		}
	}

	// --- persistence -------------------------------------------------------

	getState(): PersistedState {
		return {
			queue: this.queue,
			index: this.index,
			position: this.audio.currentTime || 0,
			mode: this.mode,
			volume: this.audio.volume,
			// activeTab is owned by the view and merged in by the caller.
			activeTab: "nowPlaying",
		};
	}

	/** Restore a persisted queue without autoplaying. */
	restore(state: PersistedState) {
		this.queue = state.queue ?? [];
		this.index = state.index ?? -1;
		this.mode = state.mode ?? "normal";
		this.audio.volume = state.volume ?? 1;

		const track = this.current;
		const client = this.getClient();
		if (track) {
			if (track.streamUrl) {
				// Radio station — stream URL is self-contained; no position restore.
				this.audio.src = track.streamUrl;
				this.audio.load();
			} else if (client) {
				this.audio.src = client.streamUrl(track.id);
				const pos = state.position ?? 0;
				if (pos > 0) {
					const seekOnce = () => {
						this.audio.currentTime = pos;
						this.audio.removeEventListener("loadedmetadata", seekOnce);
					};
					this.audio.addEventListener("loadedmetadata", seekOnce);
				}
				this.audio.load();
			}
		}
		this.emit();
	}

	private schedulePersist() {
		// Persist immediately on structural change, and keep saving position
		// every 5s while playing so a restart restores close to where we were.
		this.persist();
		if (this.persistTimer !== null) {
			window.clearInterval(this.persistTimer);
			this.persistTimer = null;
		}
		if (this.isPlaying) {
			this.persistTimer = window.setInterval(() => this.persist(), 5000);
		}
	}

	destroy() {
		if (this.persistTimer !== null) window.clearInterval(this.persistTimer);
		this.audio.pause();
		this.audio.src = "";
		this.prefetchAudio.src = "";
	}
}
