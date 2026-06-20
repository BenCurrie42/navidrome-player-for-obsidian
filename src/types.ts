// Domain interfaces for the Subsonic data the plugin consumes, plus the plugin's
// own settings and persisted-state shapes. Kept deliberately narrow — only the
// fields the MVP actually reads.

export interface Track {
	id: string;
	title: string;
	artist?: string;
	album?: string;
	albumId?: string;
	/** id to pass to getCoverArt (Subsonic `coverArt`, falls back to album id). */
	coverArt?: string;
	duration?: number; // seconds
	track?: number;
	contentType?: string;
}

export interface Album {
	id: string;
	name: string;
	artist?: string;
	artistId?: string;
	coverArt?: string;
	songCount?: number;
	year?: number;
}

export interface Artist {
	id: string;
	name: string;
	albumCount?: number;
	coverArt?: string;
}

export interface Playlist {
	id: string;
	name: string;
	songCount?: number;
	coverArt?: string;
}

export type PlaybackMode = "normal" | "random";

export type TabId = "library" | "nowPlaying";

export interface NavidromeSettings {
	serverUrl: string;
	username: string;
	password: string;
}

export const DEFAULT_SETTINGS: NavidromeSettings = {
	serverUrl: "",
	username: "",
	password: "",
};

/** Everything we persist via saveData(), in one blob alongside settings. */
export interface PersistedState {
	queue: Track[];
	index: number;
	position: number; // seconds into the current track
	mode: PlaybackMode;
	volume: number; // 0..1
	activeTab: TabId;
}

export const DEFAULT_STATE: PersistedState = {
	queue: [],
	index: -1,
	position: 0,
	mode: "normal",
	volume: 1,
	activeTab: "nowPlaying",
};

export interface PluginData {
	settings: NavidromeSettings;
	state: PersistedState;
}
