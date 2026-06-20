import { requestUrl } from "obsidian";
import { createHash, randomBytes } from "crypto";
import { Album, Artist, NavidromeSettings, Playlist, Track } from "./types";

const API_VERSION = "1.16.1";
const CLIENT_NAME = "navidrome-player";

/** Classifies failures so the UI can show an actionable message. */
export type SubsonicErrorKind =
	| "config" // missing/blank server URL or credentials
	| "unreachable" // network error, bad host, CORS, non-2xx HTTP
	| "auth" // server reported bad credentials / token
	| "server"; // server reported some other failure

export class SubsonicError extends Error {
	constructor(readonly kind: SubsonicErrorKind, message: string) {
		super(message);
		this.name = "SubsonicError";
	}
}

interface SubsonicResponse<T> {
	"subsonic-response": T & {
		status: "ok" | "failed";
		version: string;
		error?: { code: number; message: string };
	};
}

// --- raw response sub-shapes (only fields we read) -------------------------

interface RawSong {
	id: string;
	title: string;
	artist?: string;
	album?: string;
	albumId?: string;
	coverArt?: string;
	duration?: number;
	track?: number;
	contentType?: string;
}

interface RawAlbum {
	id: string;
	name: string;
	artist?: string;
	artistId?: string;
	coverArt?: string;
	songCount?: number;
	year?: number;
	song?: RawSong[];
}

interface RawArtist {
	id: string;
	name: string;
	albumCount?: number;
	coverArt?: string;
	album?: RawAlbum[];
}

interface RawPlaylist {
	id: string;
	name: string;
	songCount?: number;
	coverArt?: string;
	entry?: RawSong[];
}

// --- mappers ---------------------------------------------------------------

function toTrack(s: RawSong): Track {
	return {
		id: s.id,
		title: s.title,
		artist: s.artist,
		album: s.album,
		albumId: s.albumId,
		coverArt: s.coverArt ?? s.albumId,
		duration: s.duration,
		track: s.track,
		contentType: s.contentType,
	};
}

function toAlbum(a: RawAlbum): Album {
	return {
		id: a.id,
		name: a.name,
		artist: a.artist,
		artistId: a.artistId,
		coverArt: a.coverArt ?? a.id,
		songCount: a.songCount,
		year: a.year,
	};
}

export class SubsonicClient {
	constructor(private settings: NavidromeSettings) {}

	/** Live-update credentials without reconstructing dependents. */
	updateSettings(settings: NavidromeSettings) {
		this.settings = settings;
	}

	private get base(): string {
		const url = this.settings.serverUrl.trim().replace(/\/+$/, "");
		return url;
	}

	private requireConfigured() {
		if (!this.base || !this.settings.username || !this.settings.password) {
			throw new SubsonicError(
				"config",
				"Server URL, username, and password are all required. Set them in plugin settings."
			);
		}
	}

	/** Fresh salted token per call — the raw password never leaves the machine. */
	private authParams(): Record<string, string> {
		const salt = randomBytes(8).toString("hex");
		const token = createHash("md5")
			.update(this.settings.password + salt)
			.digest("hex");
		return {
			u: this.settings.username,
			t: token,
			s: salt,
			v: API_VERSION,
			c: CLIENT_NAME,
			f: "json",
		};
	}

	/** Build a fully-qualified, authenticated URL for any Subsonic method. */
	buildUrl(method: string, params: Record<string, string | number> = {}): string {
		const search = new URLSearchParams(this.authParams());
		for (const [k, v] of Object.entries(params)) search.set(k, String(v));
		return `${this.base}/rest/${method}?${search.toString()}`;
	}

	/** JSON API call via requestUrl (bypasses CORS for arbitrary servers). */
	private async request<T>(
		method: string,
		params: Record<string, string | number> = {}
	): Promise<T> {
		this.requireConfigured();
		const url = this.buildUrl(method, params);

		let res;
		try {
			res = await requestUrl({ url, method: "GET", throw: false });
		} catch (e) {
			throw new SubsonicError(
				"unreachable",
				`Could not reach the server. Check the URL and that it is online. (${
					(e as Error)?.message ?? e
				})`
			);
		}

		if (res.status < 200 || res.status >= 300) {
			throw new SubsonicError(
				"unreachable",
				`Server responded with HTTP ${res.status}. Check the server URL.`
			);
		}

		let body: SubsonicResponse<T>;
		try {
			body = res.json as SubsonicResponse<T>;
		} catch {
			throw new SubsonicError(
				"server",
				"Server returned a response that was not valid JSON."
			);
		}

		const payload = body?.["subsonic-response"];
		if (!payload) {
			throw new SubsonicError("server", "Unexpected response from server.");
		}
		if (payload.status === "failed") {
			const code = payload.error?.code;
			const msg = payload.error?.message ?? "Unknown server error.";
			// 40 = wrong username/password, 41/42/43/44 = token-auth related.
			const kind: SubsonicErrorKind =
				code !== undefined && code >= 40 && code <= 44 ? "auth" : "server";
			throw new SubsonicError(kind, msg);
		}
		return payload;
	}

	// --- endpoints ---------------------------------------------------------

	async ping(): Promise<void> {
		await this.request("ping");
	}

	async getAlbumList(
		type: "alphabeticalByName" | "newest" | "frequent" | "recent" = "alphabeticalByName",
		size = 100,
		offset = 0
	): Promise<Album[]> {
		const r = await this.request<{ albumList2?: { album?: RawAlbum[] } }>(
			"getAlbumList2",
			{ type, size, offset }
		);
		return (r.albumList2?.album ?? []).map(toAlbum);
	}

	async getArtists(): Promise<Artist[]> {
		const r = await this.request<{
			artists?: { index?: { artist?: RawArtist[] }[] };
		}>("getArtists");
		const out: Artist[] = [];
		for (const idx of r.artists?.index ?? []) {
			for (const a of idx.artist ?? []) {
				out.push({
					id: a.id,
					name: a.name,
					albumCount: a.albumCount,
					coverArt: a.coverArt,
				});
			}
		}
		return out;
	}

	async getArtistAlbums(id: string): Promise<Album[]> {
		const r = await this.request<{ artist?: RawArtist }>("getArtist", { id });
		return (r.artist?.album ?? []).map(toAlbum);
	}

	async getAlbumTracks(id: string): Promise<Track[]> {
		const r = await this.request<{ album?: RawAlbum }>("getAlbum", { id });
		return (r.album?.song ?? []).map(toTrack);
	}

	async getRandomSongs(size = 50): Promise<Track[]> {
		const r = await this.request<{ randomSongs?: { song?: RawSong[] } }>(
			"getRandomSongs",
			{ size }
		);
		return (r.randomSongs?.song ?? []).map(toTrack);
	}

	async getPlaylists(): Promise<Playlist[]> {
		const r = await this.request<{ playlists?: { playlist?: RawPlaylist[] } }>(
			"getPlaylists"
		);
		return (r.playlists?.playlist ?? []).map((p) => ({
			id: p.id,
			name: p.name,
			songCount: p.songCount,
			coverArt: p.coverArt,
		}));
	}

	async getPlaylistTracks(id: string): Promise<Track[]> {
		const r = await this.request<{ playlist?: RawPlaylist }>("getPlaylist", {
			id,
		});
		return (r.playlist?.entry ?? []).map(toTrack);
	}

	// --- media URLs (loaded directly by <audio>/<img>, no CORS needed) -----

	/** Original-quality stream: format=raw + maxBitRate=0 → no transcode-down. */
	streamUrl(trackId: string): string {
		return this.buildUrl("stream", { id: trackId, format: "raw", maxBitRate: 0 });
	}

	coverArtUrl(coverArtId: string, size = 300): string {
		return this.buildUrl("getCoverArt", { id: coverArtId, size });
	}
}
