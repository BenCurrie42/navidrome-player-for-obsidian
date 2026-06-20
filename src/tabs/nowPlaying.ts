import { Notice, setIcon } from "obsidian";
import { Player } from "../player";
import { SubsonicClient } from "../subsonic";

function fmtTime(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Now Playing tab: spinning cover, transport, seek/volume, and the queue. */
export class NowPlayingTab {
	private disc!: HTMLImageElement;
	private discFallback!: HTMLElement;
	private titleEl!: HTMLElement;
	private artistEl!: HTMLElement;
	private albumEl!: HTMLElement;
	private playBtn!: HTMLButtonElement;
	private shuffleBtn!: HTMLButtonElement;
	private randomBtn!: HTMLButtonElement;
	private seek!: HTMLInputElement;
	private curTime!: HTMLElement;
	private durTime!: HTMLElement;
	private volume!: HTMLInputElement;
	private queueList!: HTMLElement;
	private seeking = false;

	constructor(
		private root: HTMLElement,
		private player: Player,
		private getClient: () => SubsonicClient | null
	) {
		this.build();
		this.bindAudio();
		this.player.onChange(() => this.render());
		this.render();
	}

	private build() {
		this.root.empty();
		this.root.addClass("navidrome-nowplaying");

		const coverWrap = this.root.createDiv({ cls: "navidrome-cover-wrap" });
		this.disc = coverWrap.createEl("img", { cls: "navidrome-disc" });
		this.disc.style.display = "none";
		this.discFallback = coverWrap.createDiv({ cls: "navidrome-disc navidrome-disc-fallback" });
		setIcon(this.discFallback, "music");

		const info = this.root.createDiv({ cls: "navidrome-trackinfo" });
		this.titleEl = info.createDiv({ cls: "navidrome-title", text: "Nothing playing" });
		this.artistEl = info.createDiv({ cls: "navidrome-artist" });
		this.albumEl = info.createDiv({ cls: "navidrome-album" });

		// Seek bar with time labels.
		const seekRow = this.root.createDiv({ cls: "navidrome-seekrow" });
		this.curTime = seekRow.createSpan({ cls: "navidrome-time", text: "0:00" });
		this.seek = seekRow.createEl("input", { cls: "navidrome-seek" });
		this.seek.type = "range";
		this.seek.min = "0";
		this.seek.max = "0";
		this.seek.value = "0";
		this.durTime = seekRow.createSpan({ cls: "navidrome-time", text: "0:00" });

		this.seek.addEventListener("input", () => {
			this.seeking = true;
			this.curTime.setText(fmtTime(Number(this.seek.value)));
		});
		this.seek.addEventListener("change", () => {
			this.player.seek(Number(this.seek.value));
			this.seeking = false;
		});

		// Transport row.
		const transport = this.root.createDiv({ cls: "navidrome-transport" });
		const prevBtn = transport.createEl("button", { cls: "navidrome-btn" });
		setIcon(prevBtn, "skip-back");
		prevBtn.onclick = () => this.player.prev();

		this.playBtn = transport.createEl("button", { cls: "navidrome-btn navidrome-btn-play" });
		setIcon(this.playBtn, "play");
		this.playBtn.onclick = () => this.player.togglePlay();

		const nextBtn = transport.createEl("button", { cls: "navidrome-btn" });
		setIcon(nextBtn, "skip-forward");
		nextBtn.onclick = () => this.player.next();

		// Secondary controls: shuffle, vibes, volume.
		const controls = this.root.createDiv({ cls: "navidrome-controls" });
		this.shuffleBtn = controls.createEl("button", { cls: "navidrome-btn navidrome-btn-sm" });
		setIcon(this.shuffleBtn, "shuffle");
		this.shuffleBtn.setAttr("aria-label", "Shuffle queue");
		this.shuffleBtn.onclick = () => {
			this.player.shuffle();
			new Notice("Queue shuffled");

			// Flash the accent colour briefly.
			this.shuffleBtn.addClass("is-flash");
			window.setTimeout(() => this.shuffleBtn.removeClass("is-flash"), 600);

			// Spin animation — remove first to re-trigger on rapid clicks.
			this.shuffleBtn.removeClass("is-shuffling");
			void this.shuffleBtn.offsetWidth; // force reflow
			this.shuffleBtn.addClass("is-shuffling");
			const onEnd = () => {
				this.shuffleBtn.removeClass("is-shuffling");
				this.shuffleBtn.removeEventListener("animationend", onEnd);
			};
			this.shuffleBtn.addEventListener("animationend", onEnd);
			window.setTimeout(() => {
				this.shuffleBtn.removeClass("is-shuffling");
				this.shuffleBtn.removeEventListener("animationend", onEnd);
			}, 700);
		};

		this.randomBtn = controls.createEl("button", { cls: "navidrome-btn navidrome-btn-sm" });
		setIcon(this.randomBtn, "dice-5");
		this.randomBtn.setAttr("aria-label", "Random (vibes) mode");
		this.randomBtn.onclick = () => {
			this.player.setMode(this.player.mode === "random" ? "normal" : "random");
		};

		const volWrap = controls.createDiv({ cls: "navidrome-volwrap" });
		const volIcon = volWrap.createSpan({ cls: "navidrome-volicon" });
		setIcon(volIcon, "volume-2");
		this.volume = volWrap.createEl("input", { cls: "navidrome-volume" });
		this.volume.type = "range";
		this.volume.min = "0";
		this.volume.max = "1";
		this.volume.step = "0.01";
		this.volume.value = String(this.player.volume);
		this.volume.addEventListener("input", () =>
			this.player.setVolume(Number(this.volume.value))
		);

		// Up-next queue.
		this.root.createEl("h4", { cls: "navidrome-queue-head", text: "Up next" });
		this.queueList = this.root.createDiv({ cls: "navidrome-queue" });
	}

	private bindAudio() {
		const a = this.player.audio;
		a.addEventListener("timeupdate", () => {
			if (this.seeking) return;
			this.seek.value = String(a.currentTime);
			this.curTime.setText(fmtTime(a.currentTime));
		});
		const onDuration = () => {
			const d = Number.isFinite(a.duration) ? a.duration : 0;
			this.seek.max = String(d);
			this.durTime.setText(fmtTime(d));
		};
		a.addEventListener("loadedmetadata", onDuration);
		a.addEventListener("durationchange", onDuration);
		a.addEventListener("play", () => this.updateSpin());
		a.addEventListener("pause", () => this.updateSpin());
		a.addEventListener("playing", () => this.updateSpin());
	}

	private updateSpin() {
		this.disc.toggleClass("spinning", this.player.isPlaying);
	}

	render() {
		const track = this.player.current;

		// Cover art.
		const client = this.getClient();
		if (track?.coverArt && client) {
			this.disc.src = client.coverArtUrl(track.coverArt);
			this.disc.style.display = "";
			this.discFallback.style.display = "none";
		} else {
			this.disc.style.display = "none";
			this.discFallback.style.display = "";
		}
		this.updateSpin();

		// Metadata.
		this.titleEl.setText(track?.title ?? "Nothing playing");
		this.artistEl.setText(track?.artist ?? "");
		this.albumEl.setText(track?.album ?? "");

		// Play button glyph.
		setIcon(this.playBtn, this.player.isPlaying ? "pause" : "play");

		// Mode button states.
		this.randomBtn.toggleClass("is-active", this.player.mode === "random");

		// Volume (in case it changed elsewhere).
		this.volume.value = String(this.player.volume);

		this.renderQueue();
	}

	private renderQueue() {
		this.queueList.empty();
		const upcoming = this.player.queue.slice(this.player.index + 1);
		if (upcoming.length === 0) {
			this.queueList.createDiv({
				cls: "navidrome-queue-empty",
				text: "Queue is empty.",
			});
			return;
		}
		upcoming.forEach((t, i) => {
			const realIndex = this.player.index + 1 + i;
			const row = this.queueList.createDiv({ cls: "navidrome-queue-item" });
			row.createSpan({ cls: "navidrome-queue-title", text: t.title });
			if (t.artist) {
				row.createSpan({ cls: "navidrome-queue-artist", text: t.artist });
			}
			row.onclick = () => this.player.jumpTo(realIndex);
		});
	}
}
