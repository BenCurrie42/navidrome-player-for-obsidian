import { ItemView, WorkspaceLeaf } from "obsidian";
import type NavidromePlugin from "../main";
import { LibraryTab } from "./tabs/library";
import { NowPlayingTab } from "./tabs/nowPlaying";
import { QueueTab } from "./tabs/queue";
import { TabId } from "./types";

export const VIEW_TYPE_NAVIDROME = "navidrome-player-view";

/**
 * Single right-leaf view hosting the Library and Now Playing tabs. Both tab
 * DOM trees are kept mounted and toggled via display, so the inactive tab's
 * scroll position is preserved and playback is never disturbed by switching.
 */
export class NavidromeView extends ItemView {
	private libraryEl!: HTMLElement;
	private nowPlayingEl!: HTMLElement;
	private queueEl!: HTMLElement;
	private libraryTab!: LibraryTab;
	private nowPlayingTab!: NowPlayingTab;
	private queueTab!: QueueTab;
	private bodies: Record<TabId, HTMLElement> = {} as never;
	private segButtons: Record<TabId, HTMLButtonElement> = {} as never;

	constructor(leaf: WorkspaceLeaf, private plugin: NavidromePlugin) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_NAVIDROME;
	}

	getDisplayText(): string {
		return "Navidrome Player";
	}

	getIcon(): string {
		return "music";
	}

	async onOpen(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass("navidrome-view");

		// Top tab switcher (segmented control).
		const seg = container.createDiv({ cls: "navidrome-tabbar" });
		const mk = (id: TabId, label: string) => {
			const b = seg.createEl("button", { cls: "navidrome-tab", text: label });
			b.onclick = () => this.switchTab(id);
			this.segButtons[id] = b;
		};
		mk("nowPlaying", "Now Playing");
		mk("queue", "Queue");
		mk("library", "Library");

		// Tab bodies (all stay mounted).
		this.nowPlayingEl = container.createDiv({ cls: "navidrome-tabbody" });
		this.queueEl = container.createDiv({ cls: "navidrome-tabbody" });
		this.libraryEl = container.createDiv({ cls: "navidrome-tabbody" });
		this.bodies = {
			nowPlaying: this.nowPlayingEl,
			queue: this.queueEl,
			library: this.libraryEl,
		};

		this.nowPlayingTab = new NowPlayingTab(
			this.nowPlayingEl,
			this.plugin.player,
			() => this.plugin.getClient(),
			() => this.plugin.settings
		);
		this.queueTab = new QueueTab(this.queueEl, this.plugin.player);
		this.libraryTab = new LibraryTab(
			this.libraryEl,
			this.plugin.player,
			() => this.plugin.getClient(),
			(msg) => this.plugin.notifyError(msg)
		);

		this.switchTab(this.plugin.data.state.activeTab ?? "nowPlaying");
	}

	private switchTab(id: TabId) {
		for (const key of Object.keys(this.bodies) as TabId[]) {
			this.bodies[key].style.display = key === id ? "" : "none";
			this.segButtons[key].toggleClass("is-active", key === id);
		}
		if (id === "library") this.libraryTab.onShow();
		void this.plugin.setActiveTab(id);
	}

	/** Re-build the Now Playing tab to pick up a settings change (e.g. coverStyle). */
	rebuildNowPlaying(): void {
		this.nowPlayingTab?.destroy();
		this.nowPlayingTab = new NowPlayingTab(
			this.nowPlayingEl,
			this.plugin.player,
			() => this.plugin.getClient(),
			() => this.plugin.settings
		);
	}

	async onClose(): Promise<void> {
		// The player lives on the plugin and keeps playing, but the view's
		// pollers/animations and change subscriptions must be released.
		this.nowPlayingTab?.destroy();
		this.queueTab?.destroy();
	}
}
