import { Notice, setIcon } from "obsidian";
import { Player } from "../player";
import { RadioMetadataPoller } from "../radioMetadata";
import { SubsonicClient } from "../subsonic";
import type { NavidromeSettings } from "../types";

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
	private waveCanvas!: HTMLCanvasElement;
	private titleEl!: HTMLElement;
	private artistEl!: HTMLElement;
	private albumEl!: HTMLElement;
	private liveBadge!: HTMLElement;
	private playBtn!: HTMLButtonElement;
	private prevBtn!: HTMLButtonElement;
	private nextBtn!: HTMLButtonElement;
	private shuffleBtn!: HTMLButtonElement;
	private randomBtn!: HTMLButtonElement;
	private seekRow!: HTMLElement;
	private seek!: HTMLInputElement;
	private curTime!: HTMLElement;
	private durTime!: HTMLElement;
	private volume!: HTMLInputElement;
	private queueList!: HTMLElement;
	private seeking = false;

	// Radio "now playing" detection + waveform animation state.
	private radioMeta: RadioMetadataPoller | null = null;
	private radioUrl: string | null = null;
	private radioNowPlaying: string | null = null;
	private waveRaf: number | null = null;
	private wavePhase = 0;
	private accent = "";
	private unsubscribe: () => void;

	constructor(
		private root: HTMLElement,
		private player: Player,
		private getClient: () => SubsonicClient | null,
		private getSettings: () => NavidromeSettings
	) {
		this.build();
		this.bindAudio();
		this.unsubscribe = this.player.onChange(() => this.render());
		this.render();
	}

	/** Stop pollers/animations and detach listeners (called before rebuild/close). */
	destroy() {
		this.unsubscribe();
		this.stopRadioMeta();
		this.stopWave();
	}

	private applyStyleClass() {
		const style = this.getSettings().coverStyle;
		this.disc.toggleClass("is-vinyl", style === "vinyl");
		this.disc.toggleClass("is-square", style === "square");
		this.discFallback.toggleClass("is-vinyl", style === "vinyl");
		this.discFallback.toggleClass("is-square", style === "square");
	}

	private build() {
		this.root.empty();
		this.root.addClass("navidrome-nowplaying");

		const coverWrap = this.root.createDiv({ cls: "navidrome-cover-wrap" });
		this.disc = coverWrap.createEl("img", { cls: "navidrome-disc" });
		this.disc.style.display = "none";
		this.discFallback = coverWrap.createDiv({ cls: "navidrome-disc navidrome-disc-fallback" });
		setIcon(this.discFallback, "music");

		// Live waveform visualiser, shown in place of the cover for radio.
		this.waveCanvas = coverWrap.createEl("canvas", { cls: "navidrome-waveform" });
		this.waveCanvas.style.display = "none";

		const info = this.root.createDiv({ cls: "navidrome-trackinfo" });
		this.titleEl = info.createDiv({ cls: "navidrome-title", text: "Nothing playing" });
		this.liveBadge = info.createDiv({ cls: "navidrome-live-badge", text: "LIVE" });
		this.liveBadge.style.display = "none";
		this.artistEl = info.createDiv({ cls: "navidrome-artist" });
		this.albumEl = info.createDiv({ cls: "navidrome-album" });

		// Seek bar with time labels.
		this.seekRow = this.root.createDiv({ cls: "navidrome-seekrow" });
		this.curTime = this.seekRow.createSpan({ cls: "navidrome-time", text: "0:00" });
		this.seek = this.seekRow.createEl("input", { cls: "navidrome-seek" });
		this.seek.type = "range";
		this.seek.min = "0";
		this.seek.max = "0";
		this.seek.value = "0";
		this.durTime = this.seekRow.createSpan({ cls: "navidrome-time", text: "0:00" });

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
		this.prevBtn = transport.createEl("button", { cls: "navidrome-btn" });
		setIcon(this.prevBtn, "skip-back");
		this.prevBtn.onclick = () => this.player.prev();

		this.playBtn = transport.createEl("button", { cls: "navidrome-btn navidrome-btn-play" });
		setIcon(this.playBtn, "play");
		this.playBtn.onclick = () => this.player.togglePlay();

		this.nextBtn = transport.createEl("button", { cls: "navidrome-btn" });
		setIcon(this.nextBtn, "skip-forward");
		this.nextBtn.onclick = () => this.player.next();

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
		const isSquare = this.getSettings().coverStyle === "square";
		this.disc.toggleClass("spinning", !isSquare && this.player.isPlaying);
	}

	// --- radio "now playing" detection -------------------------------------

	/** (Re)start ICY metadata polling for a station, or stop if url is null. */
	private startRadioMeta(url: string | null) {
		if (url === this.radioUrl) return; // already polling this station
		this.stopRadioMeta();
		if (!url) return;
		this.radioUrl = url;
		this.radioMeta = new RadioMetadataPoller(url, (title) => {
			this.radioNowPlaying = title;
			this.render();
		});
		this.radioMeta.start();
	}

	private stopRadioMeta() {
		this.radioMeta?.stop();
		this.radioMeta = null;
		this.radioUrl = null;
		this.radioNowPlaying = null;
	}

	// --- waveform visualiser -----------------------------------------------

	/** Animate the waveform while a radio stream is playing; rest when paused. */
	private updateWave() {
		if (this.player.isPlaying) this.startWave();
		else {
			this.stopWave();
			this.drawWave(); // one static (low) frame
		}
	}

	private startWave() {
		if (this.waveRaf !== null) return;
		const step = () => {
			this.wavePhase += 0.06;
			this.drawWave();
			this.waveRaf = window.requestAnimationFrame(step);
		};
		this.waveRaf = window.requestAnimationFrame(step);
	}

	private stopWave() {
		if (this.waveRaf !== null) {
			window.cancelAnimationFrame(this.waveRaf);
			this.waveRaf = null;
		}
	}

	private drawWave() {
		const canvas = this.waveCanvas;
		if (canvas.style.display === "none") return;
		const dpr = window.devicePixelRatio || 1;
		const w = canvas.clientWidth || 300;
		const h = canvas.clientHeight || 160;
		if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
			canvas.width = Math.round(w * dpr);
			canvas.height = Math.round(h * dpr);
		}
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, w, h);

		if (!this.accent) {
			this.accent =
				getComputedStyle(document.body)
					.getPropertyValue("--interactive-accent")
					.trim() || "#7c6cff";
		}
		ctx.fillStyle = this.accent;

		const playing = this.player.isPlaying;
		const bars = 40;
		const gap = 3;
		const barW = Math.max(2, (w - gap * (bars - 1)) / bars);
		const mid = h / 2;
		const maxAmp = playing ? h * 0.44 : h * 0.03;
		for (let i = 0; i < bars; i++) {
			// Two out-of-phase sines per bar give an organic, non-repetitive look.
			const n = playing
				? 0.25 +
				  0.75 *
						Math.abs(
							Math.sin(this.wavePhase * 1.3 + i * 0.5) *
								Math.sin(this.wavePhase * 0.7 + i * 0.27)
						)
				: 1;
			const bh = Math.max(2, maxAmp * n);
			const x = i * (barW + gap);
			const r = Math.min(barW / 2, 2);
			this.roundRect(ctx, x, mid - bh / 2, barW, bh, r);
		}
	}

	private roundRect(
		ctx: CanvasRenderingContext2D,
		x: number,
		y: number,
		w: number,
		h: number,
		r: number
	) {
		ctx.beginPath();
		ctx.moveTo(x + r, y);
		ctx.arcTo(x + w, y, x + w, y + h, r);
		ctx.arcTo(x + w, y + h, x, y + h, r);
		ctx.arcTo(x, y + h, x, y, r);
		ctx.arcTo(x, y, x + w, y, r);
		ctx.closePath();
		ctx.fill();
	}

	render() {
		const track = this.player.current;
		const isRadio = track?.isRadio ?? false;

		// Apply cover style classes.
		this.applyStyleClass();

		const client = this.getClient();
		if (isRadio) {
			// Radio: a live waveform stands in for the (absent) cover art.
			this.disc.style.display = "none";
			this.discFallback.style.display = "none";
			this.waveCanvas.style.display = "";
			this.startRadioMeta(track?.streamUrl ?? null);
			this.updateWave();
		} else {
			this.waveCanvas.style.display = "none";
			this.stopRadioMeta();
			this.stopWave();
			// Cover art.
			if (track?.coverArt && client) {
				this.disc.src = client.coverArtUrl(track.coverArt);
				this.disc.style.display = "";
				this.discFallback.style.display = "none";
			} else {
				this.disc.style.display = "none";
				this.discFallback.style.display = "";
			}
			this.updateSpin();
		}

		// Seek bar: hidden for radio (no meaningful duration).
		this.seekRow.style.display = isRadio ? "none" : "";

		// Metadata. For radio the station name is the title and the detected
		// "now playing" song (best effort) takes the artist line.
		this.titleEl.setText(track?.title ?? "Nothing playing");
		this.liveBadge.style.display = isRadio ? "" : "none";
		if (isRadio) {
			this.artistEl.setText(this.radioNowPlaying ?? "");
			this.albumEl.setText("");
		} else {
			this.artistEl.setText(track?.artist ?? "");
			this.albumEl.setText(track?.album ?? "");
		}

		// Prev/next: hidden for radio (no queue to navigate).
		this.prevBtn.style.display = isRadio ? "none" : "";
		this.nextBtn.style.display = isRadio ? "none" : "";

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
