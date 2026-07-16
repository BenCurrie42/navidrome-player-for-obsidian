import { Notice, setIcon } from "obsidian";
import { Player } from "../player";
import { SubsonicClient } from "../subsonic";
import { Album } from "../types";

type SubviewId = "albums" | "artists" | "playlists" | "radio";

/** Sub-tab bar width below which the button row collapses into a dropdown. */
const SUBSEG_COLLAPSE_BREAKPOINT = 220;

const SUBVIEWS: [SubviewId, string][] = [
	["albums", "Albums"],
	["artists", "Artists"],
	["playlists", "Playlists"],
	["radio", "Radio"],
];

/** Library tab: browse albums, artists, and playlists; click to play. */
export class LibraryTab {
	private subview: SubviewId = "albums";
	private content!: HTMLElement;
	private segButtons: Record<SubviewId, HTMLButtonElement> = {} as never;
	private subSelect!: HTMLSelectElement;
	private subsegResizeObs?: ResizeObserver;
	private loaded: Record<SubviewId, boolean> = {
		albums: false,
		artists: false,
		playlists: false,
		radio: false,
	};

	constructor(
		private root: HTMLElement,
		private player: Player,
		private getClient: () => SubsonicClient | null,
		private onError: (msg: string) => void
	) {
		this.build();
	}

	private build() {
		this.root.empty();
		this.root.addClass("navidrome-library");

		const seg = this.root.createDiv({ cls: "navidrome-subseg" });
		const mk = (id: SubviewId, label: string) => {
			const b = seg.createEl("button", { cls: "navidrome-subseg-btn", text: label });
			b.onclick = () => this.showSubview(id);
			this.segButtons[id] = b;
		};
		for (const [id, label] of SUBVIEWS) mk(id, label);

		// Collapsed-width dropdown — created once, shown/hidden via `is-collapsed`
		// on the sub-tab bar (CSS handles the swap, matching the top tab bar).
		this.subSelect = seg.createEl("select", {
			cls: "dropdown navidrome-subseg-select",
		});
		this.subSelect.setAttr("aria-label", "Select library section");
		for (const [id, label] of SUBVIEWS) {
			this.subSelect.createEl("option", { value: id, text: label });
		}
		this.subSelect.onchange = () =>
			this.showSubview(this.subSelect.value as SubviewId);

		const refresh = seg.createEl("button", { cls: "navidrome-subseg-btn navidrome-refresh" });
		setIcon(refresh, "refresh-cw");
		refresh.setAttr("aria-label", "Reload");
		refresh.onclick = () => {
			this.loaded[this.subview] = false;
			this.showSubview(this.subview);
		};

		this.subsegResizeObs = new ResizeObserver(() => {
			const width = seg.clientWidth;
			if (width === 0) return; // bar is hidden (e.g. Library tab not active)
			seg.toggleClass("is-collapsed", width < SUBSEG_COLLAPSE_BREAKPOINT);
		});
		this.subsegResizeObs.observe(seg);

		this.content = this.root.createDiv({ cls: "navidrome-library-content" });
		this.showSubview("albums");
	}

	/** Called by the view when the Library tab becomes visible. */
	onShow() {
		if (!this.loaded[this.subview]) this.showSubview(this.subview);
	}

	/** Release the resize observer when the view closes. */
	destroy() {
		this.subsegResizeObs?.disconnect();
	}

	private showSubview(id: SubviewId) {
		this.subview = id;
		for (const key of Object.keys(this.segButtons) as SubviewId[]) {
			this.segButtons[key].toggleClass("is-active", key === id);
		}
		this.subSelect.value = id;
		if (id === "albums") void this.loadAlbums();
		else if (id === "artists") void this.loadArtists();
		else if (id === "playlists") void this.loadPlaylists();
		else void this.loadRadio();
	}

	private requireClient(): SubsonicClient | null {
		const client = this.getClient();
		if (!client) {
			this.content.empty();
			this.content.createDiv({
				cls: "navidrome-empty",
				text: "Configure your server in plugin settings to browse your library.",
			});
		}
		return client;
	}

	private showLoading() {
		this.content.empty();
		this.content.createDiv({ cls: "navidrome-loading", text: "Loading…" });
	}

	// --- albums ------------------------------------------------------------

	private async loadAlbums() {
		const client = this.requireClient();
		if (!client) return;
		this.showLoading();
		try {
			const albums = await client.getAlbumList("alphabeticalByName", 200);
			this.loaded.albums = true;
			this.renderAlbumGrid(albums, this.content);
		} catch (e) {
			this.renderError(e);
		}
	}

	private renderAlbumGrid(albums: Album[], target: HTMLElement) {
		target.empty();
		if (albums.length === 0) {
			target.createDiv({ cls: "navidrome-empty", text: "No albums found." });
			return;
		}
		const grid = target.createDiv({ cls: "navidrome-album-grid" });
		const client = this.getClient();
		for (const album of albums) {
			const card = grid.createDiv({ cls: "navidrome-album-card" });
			const art = card.createDiv({ cls: "navidrome-album-art" });
			if (album.coverArt && client) {
				const img = art.createEl("img");
				img.src = client.coverArtUrl(album.coverArt, 200);
				img.loading = "lazy";
			} else {
				setIcon(art, "disc");
			}
			card.createDiv({ cls: "navidrome-album-name", text: album.name });
			if (album.artist) {
				card.createDiv({ cls: "navidrome-album-artist", text: album.artist });
			}
			card.onclick = () => this.playAlbum(album);
		}
	}

	private async playAlbum(album: Album) {
		const client = this.getClient();
		if (!client) return;
		try {
			const tracks = await client.getAlbumTracks(album.id);
			if (tracks.length === 0) {
				new Notice("That album has no tracks.");
				return;
			}
			this.player.loadQueue(tracks, 0, true);
			new Notice(`Playing "${album.name}"`);
		} catch (e) {
			this.onError(`Could not load album: ${(e as Error).message}`);
		}
	}

	// --- artists -----------------------------------------------------------

	private async loadArtists() {
		const client = this.requireClient();
		if (!client) return;
		this.showLoading();
		try {
			const artists = await client.getArtists();
			this.loaded.artists = true;
			this.content.empty();
			if (artists.length === 0) {
				this.content.createDiv({ cls: "navidrome-empty", text: "No artists found." });
				return;
			}
			const list = this.content.createDiv({ cls: "navidrome-artist-list" });
			for (const artist of artists) {
				const row = list.createDiv({ cls: "navidrome-artist-row" });
				const header = row.createDiv({ cls: "navidrome-artist-header" });
				const chevron = header.createSpan({ cls: "navidrome-chevron" });
				setIcon(chevron, "chevron-right");
				header.createSpan({ cls: "navidrome-artist-name", text: artist.name });
				const albumsBox = row.createDiv({ cls: "navidrome-artist-albums" });
				albumsBox.style.display = "none";

				let expanded = false;
				let albumsLoaded = false;
				header.onclick = async () => {
					expanded = !expanded;
					chevron.empty();
					setIcon(chevron, expanded ? "chevron-down" : "chevron-right");
					albumsBox.style.display = expanded ? "" : "none";
					if (expanded && !albumsLoaded) {
						albumsBox.createDiv({ cls: "navidrome-loading", text: "Loading…" });
						try {
							const albums = await client.getArtistAlbums(artist.id);
							albumsLoaded = true;
							this.renderAlbumGrid(albums, albumsBox);
						} catch (e) {
							albumsBox.empty();
							albumsBox.createDiv({
								cls: "navidrome-error",
								text: `Could not load albums: ${(e as Error).message}`,
							});
						}
					}
				};
			}
		} catch (e) {
			this.renderError(e);
		}
	}

	// --- playlists ---------------------------------------------------------

	private async loadPlaylists() {
		const client = this.requireClient();
		if (!client) return;
		this.showLoading();
		try {
			const playlists = await client.getPlaylists();
			this.loaded.playlists = true;
			this.content.empty();
			if (playlists.length === 0) {
				this.content.createDiv({ cls: "navidrome-empty", text: "No playlists found." });
				return;
			}
			const list = this.content.createDiv({ cls: "navidrome-playlist-list" });
			for (const pl of playlists) {
				const row = list.createDiv({ cls: "navidrome-playlist-row" });
				setIcon(row.createSpan({ cls: "navidrome-playlist-icon" }), "list-music");
				const meta = row.createDiv({ cls: "navidrome-playlist-meta" });
				meta.createSpan({ cls: "navidrome-playlist-name", text: pl.name });
				if (pl.songCount !== undefined) {
					meta.createSpan({
						cls: "navidrome-playlist-count",
						text: `${pl.songCount} song${pl.songCount === 1 ? "" : "s"}`,
					});
				}
				row.onclick = async () => {
					try {
						const tracks = await client.getPlaylistTracks(pl.id);
						if (tracks.length === 0) {
							new Notice("That playlist is empty.");
							return;
						}
						this.player.loadQueue(tracks, 0, true);
						new Notice(`Playing "${pl.name}"`);
					} catch (e) {
						this.onError(`Could not load playlist: ${(e as Error).message}`);
					}
				};
			}
		} catch (e) {
			this.renderError(e);
		}
	}

	// --- radio ----------------------------------------------------------------

	private async loadRadio() {
		const client = this.requireClient();
		if (!client) return;
		this.showLoading();
		try {
			const stations = await client.getRadioStations();
			this.loaded.radio = true;
			this.content.empty();
			if (stations.length === 0) {
				this.content.createDiv({ cls: "navidrome-empty", text: "No saved radio stations." });
				return;
			}
			const list = this.content.createDiv({ cls: "navidrome-radio-list" });
			for (const station of stations) {
				const row = list.createDiv({ cls: "navidrome-radio-row" });
				setIcon(row.createSpan({ cls: "navidrome-radio-icon" }), "radio");
				const meta = row.createDiv({ cls: "navidrome-radio-meta" });
				meta.createSpan({ cls: "navidrome-radio-name", text: station.name });
				if (station.homepageUrl) {
					meta.createSpan({ cls: "navidrome-radio-homepage", text: station.homepageUrl });
				}
				row.onclick = () => {
					this.player.playRadio(station);
					new Notice(`Playing "${station.name}"`);
				};
			}
		} catch (e) {
			this.renderError(e);
		}
	}

	private renderError(e: unknown) {
		this.content.empty();
		this.content.createDiv({
			cls: "navidrome-error",
			text: `Could not load: ${(e as Error).message}`,
		});
	}
}
