import { Notice, setIcon } from "obsidian";
import { Player } from "../player";
import { SubsonicClient } from "../subsonic";
import { Album, Artist, Track } from "../types";

/**
 * Search results controller: owns the results overlay, queries `search3`,
 * and renders grouped Artists/Albums/Songs with click-to-play. The view
 * calls `run()` on each debounced query and `onDismiss` to clear results.
 */
export class SearchController {
	private requestId = 0;

	constructor(
		private root: HTMLElement,
		private player: Player,
		private getClient: () => SubsonicClient | null,
		private onDismiss: () => void
	) {}

	private showState(cls: string, text: string) {
		this.root.empty();
		this.root.createDiv({ cls, text });
	}

	showLoading() {
		this.showState("navidrome-loading", "Loading…");
	}

	clear() {
		this.root.empty();
	}

	async run(query: string) {
		const client = this.getClient();
		if (!client) {
			this.showState(
				"navidrome-empty",
				"Configure your server in plugin settings to search your library."
			);
			return;
		}
		const id = ++this.requestId;
		this.showLoading();
		try {
			const { artists, albums, songs } = await client.search3(query);
			if (id !== this.requestId) return; // superseded by a newer query
			this.render(artists, albums, songs);
		} catch (e) {
			if (id !== this.requestId) return;
			this.root.empty();
			this.root.createDiv({
				cls: "navidrome-error",
				text: `Could not search: ${(e as Error).message}`,
			});
		}
	}

	private render(artists: Artist[], albums: Album[], songs: Track[]) {
		this.root.empty();
		if (artists.length === 0 && albums.length === 0 && songs.length === 0) {
			this.root.createDiv({ cls: "navidrome-empty", text: "No results." });
			return;
		}

		if (artists.length > 0) this.renderArtists(artists);
		if (albums.length > 0) this.renderAlbums(albums);
		if (songs.length > 0) this.renderSongs(songs);
	}

	private renderArtists(artists: Artist[]) {
		this.root.createEl("h4", { cls: "navidrome-search-heading", text: "Artists" });
		const list = this.root.createDiv({ cls: "navidrome-artist-list" });
		const client = this.getClient();
		for (const artist of artists) {
			const row = list.createDiv({ cls: "navidrome-artist-row" });
			const header = row.createDiv({ cls: "navidrome-artist-header" });
			if (artist.coverArt && client) {
				const img = header.createEl("img", { cls: "navidrome-search-artist-art" });
				img.src = client.coverArtUrl(artist.coverArt, 60);
				img.loading = "lazy";
			} else {
				const icon = header.createSpan({ cls: "navidrome-chevron" });
				setIcon(icon, "user");
			}
			header.createSpan({ cls: "navidrome-artist-name", text: artist.name });
			header.onclick = () => this.playArtist(artist);
		}
	}

	private renderAlbums(albums: Album[]) {
		this.root.createEl("h4", { cls: "navidrome-search-heading", text: "Albums" });
		const grid = this.root.createDiv({ cls: "navidrome-album-grid" });
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

	private renderSongs(songs: Track[]) {
		this.root.createEl("h4", { cls: "navidrome-search-heading", text: "Songs" });
		const list = this.root.createDiv({ cls: "navidrome-queue" });
		for (const song of songs) {
			const row = list.createDiv({ cls: "navidrome-queue-item navidrome-search-song" });
			row.createSpan({ cls: "navidrome-queue-title", text: song.title });
			if (song.artist) {
				row.createSpan({ cls: "navidrome-queue-artist", text: song.artist });
			}
			row.onclick = () => this.playSong(song, songs);
		}
	}

	// --- play handlers -------------------------------------------------------

	private async playArtist(artist: Artist) {
		const client = this.getClient();
		if (!client) return;
		try {
			const albums = await client.getArtistAlbums(artist.id);
			const tracks: Track[] = [];
			for (const album of albums) {
				tracks.push(...(await client.getAlbumTracks(album.id)));
			}
			if (tracks.length === 0) {
				new Notice("That artist has no tracks.");
				return;
			}
			this.player.loadQueue(tracks, 0, true);
			new Notice(`Playing "${artist.name}"`);
			this.onDismiss();
		} catch (e) {
			new Notice(`Could not load artist: ${(e as Error).message}`);
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
			this.onDismiss();
		} catch (e) {
			new Notice(`Could not load album: ${(e as Error).message}`);
		}
	}

	private playSong(song: Track, songs: Track[]) {
		const startIndex = songs.indexOf(song);
		this.player.loadQueue(songs, Math.max(startIndex, 0), true);
		new Notice(`Playing "${song.title}"`);
		this.onDismiss();
	}
}
