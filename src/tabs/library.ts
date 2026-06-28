import { Notice, setIcon } from "obsidian";
import { Player } from "../player";
import { SubsonicClient } from "../subsonic";
import { Album, Artist, SearchResults, Track } from "../types";

const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_MIN_CHARS = 2;

type SubviewId = "albums" | "artists" | "playlists";

/** Library tab: browse albums, artists, and playlists; click to play. */
export class LibraryTab {
	private subview: SubviewId = "albums";
	private content!: HTMLElement;
	private segButtons: Record<SubviewId, HTMLButtonElement> = {} as never;
	private loaded: Record<SubviewId, boolean> = {
		albums: false,
		artists: false,
		playlists: false,
	};
	private query = "";
	private searchTimer: number | null = null;

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

		const search = this.root.createDiv({ cls: "navidrome-search" });
		setIcon(search.createSpan({ cls: "navidrome-search-icon" }), "search");
		const input = search.createEl("input", {
			cls: "navidrome-search-input",
			attr: { type: "search", placeholder: "Search songs, albums, artists…" },
		});
		input.oninput = () => this.onQueryInput(input.value);

		const seg = this.root.createDiv({ cls: "navidrome-subseg" });
		const mk = (id: SubviewId, label: string) => {
			const b = seg.createEl("button", { cls: "navidrome-subseg-btn", text: label });
			b.onclick = () => this.showSubview(id);
			this.segButtons[id] = b;
		};
		mk("albums", "Albums");
		mk("artists", "Artists");
		mk("playlists", "Playlists");

		const refresh = seg.createEl("button", { cls: "navidrome-subseg-btn navidrome-refresh" });
		setIcon(refresh, "refresh-cw");
		refresh.setAttr("aria-label", "Reload");
		refresh.onclick = () => {
			this.loaded[this.subview] = false;
			this.showSubview(this.subview);
		};

		this.content = this.root.createDiv({ cls: "navidrome-library-content" });
		this.showSubview("albums");
	}

	/** Called by the view when the Library tab becomes visible. */
	onShow() {
		if (this.query.length >= SEARCH_MIN_CHARS) return; // keep results on screen
		if (!this.loaded[this.subview]) this.showSubview(this.subview);
	}

	private showSubview(id: SubviewId) {
		this.subview = id;
		for (const key of Object.keys(this.segButtons) as SubviewId[]) {
			this.segButtons[key].toggleClass("is-active", key === id);
		}
		if (id === "albums") void this.loadAlbums();
		else if (id === "artists") void this.loadArtists();
		else void this.loadPlaylists();
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

	// --- search ------------------------------------------------------------

	private onQueryInput(raw: string) {
		this.query = raw.trim();
		if (this.searchTimer !== null) window.clearTimeout(this.searchTimer);

		if (this.query.length < SEARCH_MIN_CHARS) {
			// Empty / too-short query: drop back to the normal browse view.
			this.showSubview(this.subview);
			return;
		}
		this.searchTimer = window.setTimeout(
			() => void this.runSearch(this.query),
			SEARCH_DEBOUNCE_MS
		);
	}

	private async runSearch(query: string) {
		const client = this.requireClient();
		if (!client) return;
		this.showLoading();
		try {
			const results = await client.search(query);
			// Ignore a response the user has already typed past.
			if (query !== this.query) return;
			this.renderSearchResults(results);
		} catch (e) {
			if (query !== this.query) return;
			this.renderError(e);
		}
	}

	private renderSearchResults(results: SearchResults) {
		this.content.empty();
		const client = this.getClient();
		if (!client) return;

		const { tracks, albums, artists } = results;
		if (tracks.length === 0 && albums.length === 0 && artists.length === 0) {
			this.content.createDiv({ cls: "navidrome-empty", text: "No results." });
			return;
		}

		if (tracks.length > 0) {
			const section = this.section("Songs");
			this.renderTrackList(tracks, section);
		}
		if (albums.length > 0) {
			const section = this.section("Albums");
			this.renderAlbumGrid(albums, section);
		}
		if (artists.length > 0) {
			const section = this.section("Artists");
			const list = section.createDiv({ cls: "navidrome-artist-list" });
			for (const artist of artists) this.renderArtistRow(artist, list, client);
		}
	}

	private section(label: string): HTMLElement {
		const wrap = this.content.createDiv({ cls: "navidrome-results-section" });
		wrap.createDiv({ cls: "navidrome-results-heading", text: label });
		return wrap;
	}

	private renderTrackList(tracks: Track[], target: HTMLElement) {
		const list = target.createDiv({ cls: "navidrome-track-list" });
		tracks.forEach((track, i) => {
			const row = list.createDiv({ cls: "navidrome-track-row" });
			setIcon(row.createSpan({ cls: "navidrome-track-icon" }), "music");
			const meta = row.createDiv({ cls: "navidrome-track-meta" });
			meta.createSpan({ cls: "navidrome-track-title", text: track.title });
			if (track.artist) {
				meta.createSpan({ cls: "navidrome-track-artist", text: track.artist });
			}
			row.onclick = () => {
				this.player.loadQueue(tracks, i, true);
				new Notice(`Playing "${track.title}"`);
			};
		});
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
			for (const artist of artists) this.renderArtistRow(artist, list, client);
		} catch (e) {
			this.renderError(e);
		}
	}

	/** One expandable artist row (header → chevron-toggled inline album grid). */
	private renderArtistRow(artist: Artist, list: HTMLElement, client: SubsonicClient) {
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

	private renderError(e: unknown) {
		this.content.empty();
		this.content.createDiv({
			cls: "navidrome-error",
			text: `Could not load: ${(e as Error).message}`,
		});
	}
}
