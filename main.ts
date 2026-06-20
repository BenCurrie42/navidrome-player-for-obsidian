import { Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { Player } from "./src/player";
import { NavidromeSettingTab } from "./src/settings";
import { SubsonicClient } from "./src/subsonic";
import {
	DEFAULT_SETTINGS,
	DEFAULT_STATE,
	NavidromeSettings,
	PluginData,
	TabId,
} from "./src/types";
import { NavidromeView, VIEW_TYPE_NAVIDROME } from "./src/view";

export default class NavidromePlugin extends Plugin {
	data!: PluginData;
	player!: Player;
	/** Reference to data.settings so the settings tab can mutate fields in place. */
	settings!: NavidromeSettings;
	private client: SubsonicClient | null = null;

	async onload() {
		await this.loadPluginData();
		this.rebuildClient();

		this.player = new Player(
			() => this.getClient(),
			() => void this.persistState(),
			(msg) => this.notifyError(msg)
		);
		// Restore the previous queue and position without autoplaying.
		this.player.restore(this.data.state);

		this.registerView(
			VIEW_TYPE_NAVIDROME,
			(leaf) => new NavidromeView(leaf, this)
		);

		this.addRibbonIcon("music", "Navidrome Player", () => this.activateView());

		this.addCommand({
			id: "open-navidrome-player",
			name: "Open Navidrome Player",
			callback: () => this.activateView(),
		});

		this.addSettingTab(new NavidromeSettingTab(this.app, this));
	}

	onunload() {
		this.player?.destroy();
	}

	// --- data --------------------------------------------------------------

	private async loadPluginData() {
		const loaded = (await this.loadData()) as Partial<PluginData> | null;
		this.data = {
			settings: { ...DEFAULT_SETTINGS, ...(loaded?.settings ?? {}) },
			state: { ...DEFAULT_STATE, ...(loaded?.state ?? {}) },
		};
		this.settings = this.data.settings;
	}

	async saveSettings() {
		await this.saveData(this.data);
		this.rebuildClient();
	}

	/** Merge live player state with the persisted active tab and write to disk. */
	private async persistState() {
		const state = this.player.getState();
		state.activeTab = this.data.state.activeTab;
		this.data.state = state;
		await this.saveData(this.data);
	}

	async setActiveTab(tab: TabId) {
		this.data.state.activeTab = tab;
		await this.saveData(this.data);
	}

	// --- client ------------------------------------------------------------

	private rebuildClient() {
		const s = this.data.settings;
		if (s.serverUrl && s.username && s.password) {
			if (this.client) this.client.updateSettings(s);
			else this.client = new SubsonicClient(s);
		} else {
			this.client = null;
		}
	}

	getClient(): SubsonicClient | null {
		return this.client;
	}

	notifyError(message: string) {
		new Notice(`Navidrome: ${message}`, 6000);
	}

	// --- view --------------------------------------------------------------

	/** Re-render the Now Playing tab in any open view (called after coverStyle changes). */
	refreshNowPlaying(): void {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_NAVIDROME);
		for (const leaf of leaves) {
			if (leaf.view instanceof NavidromeView) {
				leaf.view.rebuildNowPlaying();
			}
		}
	}

	async activateView() {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null =
			workspace.getLeavesOfType(VIEW_TYPE_NAVIDROME)[0] ?? null;

		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			await leaf?.setViewState({ type: VIEW_TYPE_NAVIDROME, active: true });
		}
		if (leaf) workspace.revealLeaf(leaf);
	}
}
