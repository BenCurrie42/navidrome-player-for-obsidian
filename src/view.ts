import { ItemView, setIcon, WorkspaceLeaf } from "obsidian";
import type NavidromePlugin from "../main";
import { LibraryTab } from "./tabs/library";
import { NowPlayingTab } from "./tabs/nowPlaying";
import { QueueTab } from "./tabs/queue";
import { SearchController } from "./tabs/search";
import { TabId } from "./types";

export const VIEW_TYPE_NAVIDROME = "navidrome-player-view";

/** Debounce before a typed query triggers a search3 call. */
const SEARCH_DEBOUNCE_MS = 250;
/** Minimum query length before searching. */
const SEARCH_MIN_CHARS = 2;

/**
 * Single right-leaf view hosting the Library and Now Playing tabs. Both tab
 * DOM trees are kept mounted and toggled via display, so the inactive tab's
 * scroll position is preserved and playback is never disturbed by switching.
 * A search bar above the tab bar takes over the view with a results overlay
 * while searching, without tearing down either tab's DOM.
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
	private searchInput!: HTMLInputElement;
	private searchClearBtn!: HTMLButtonElement;
	private searchResultsEl!: HTMLElement;
	private searchController!: SearchController;
	private searchDebounceTimer: number | null = null;

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

		// Search bar — first child, above the tab bar, part of the view chrome.
		this.buildSearchBar(container);

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

		// Search results overlay — sibling of the tab bodies, hidden by default.
		this.searchResultsEl = container.createDiv({ cls: "navidrome-search-results" });
		this.searchController = new SearchController(
			this.searchResultsEl,
			this.plugin.player,
			() => this.plugin.getClient(),
			() => this.exitSearch()
		);

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

	// --- search --------------------------------------------------------------

	private buildSearchBar(container: HTMLElement) {
		const wrap = container.createDiv({ cls: "navidrome-search" });

		const icon = wrap.createSpan({ cls: "navidrome-search-icon" });
		setIcon(icon, "search");

		this.searchInput = wrap.createEl("input", { cls: "navidrome-search-input" });
		this.searchInput.type = "search";
		this.searchInput.placeholder = "Search artists, albums, songs…";

		this.searchClearBtn = wrap.createEl("button", { cls: "navidrome-search-clear" });
		setIcon(this.searchClearBtn, "x");
		this.searchClearBtn.setAttr("aria-label", "Clear search");
		this.searchClearBtn.style.display = "none";

		this.searchInput.addEventListener("input", () => this.onSearchInput());
		this.searchInput.addEventListener("keydown", (e) => {
			if (e.key === "Escape") {
				e.preventDefault();
				this.exitSearch();
			}
		});
		this.searchClearBtn.onclick = () => this.exitSearch();
	}

	private onSearchInput() {
		const value = this.searchInput.value;
		this.searchClearBtn.style.display = value.length > 0 ? "" : "none";

		if (value.length === 0) {
			this.exitSearch();
			return;
		}

		this.enterSearch();

		if (this.searchDebounceTimer !== null) {
			window.clearTimeout(this.searchDebounceTimer);
			this.searchDebounceTimer = null;
		}
		if (value.trim().length < SEARCH_MIN_CHARS) {
			this.searchController.clear();
			return;
		}
		this.searchDebounceTimer = window.setTimeout(() => {
			void this.searchController.run(value.trim());
		}, SEARCH_DEBOUNCE_MS);
	}

	/** Cover the tabs with the results overlay without touching their DOM. */
	private enterSearch() {
		this.contentEl.addClass("is-searching");
	}

	/** Clear the query, hide the overlay, and restore the tab view exactly as it was. */
	private exitSearch() {
		if (this.searchDebounceTimer !== null) {
			window.clearTimeout(this.searchDebounceTimer);
			this.searchDebounceTimer = null;
		}
		this.searchInput.value = "";
		this.searchClearBtn.style.display = "none";
		this.searchController.clear();
		this.contentEl.removeClass("is-searching");
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
