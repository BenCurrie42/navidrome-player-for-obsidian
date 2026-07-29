import { App, Notice, PluginSettingTab, Setting } from "obsidian";
// Type-only: 1.13.0+ declaration, erased at build so it is never required at
// runtime on the older Obsidian versions minAppVersion still allows.
import type { SettingDefinitionItem } from "obsidian";
import type NavidromePlugin from "../main";
import { SubsonicClient, SubsonicError } from "./subsonic";
import type { CoverStyle } from "./types";

export class NavidromeSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: NavidromePlugin) {
		super(app, plugin);
	}

	/**
	 * Declarative definitions (Obsidian 1.13.0+). Returning a non-empty array
	 * makes Obsidian render the tab from these and index every row in the
	 * settings search, so `display()` below is never called on 1.13+.
	 *
	 * The password and Test-connection rows use `render` rather than a
	 * `control`: there's no masked-input control type, and the button needs its
	 * own transient "Testing…" state, neither of which the declarative controls
	 * express. They still get indexed for search by name/desc.
	 */
	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: "Server URL",
				desc: "Your Navidrome server, e.g. https://music.example.com",
				control: {
					type: "text",
					key: "serverUrl",
					placeholder: "https://music.example.com",
				},
			},
			{
				name: "Username",
				control: { type: "text", key: "username", placeholder: "username" },
			},
			{
				name: "Password",
				desc: PASSWORD_DESC,
				aliases: ["credentials", "token", "auth"],
				render: (setting) => this.buildPasswordSetting(setting),
			},
			{
				name: "Cover style",
				desc: COVER_STYLE_DESC,
				aliases: ["vinyl", "square", "waveform", "album art"],
				control: {
					type: "dropdown",
					key: "coverStyle",
					options: {
						vinyl: "Vinyl",
						square: "Square",
						waveform: "Waveform",
					},
				},
			},
			{
				name: "Test connection",
				desc: "Ping the server with the current credentials.",
				render: (setting) => this.buildTestConnectionSetting(setting),
			},
		];
	}

	/**
	 * Read a declarative control's value out of the plugin's settings.
	 *
	 * Deliberately no `super` call in the fallback: `PluginSettingTab`'s own
	 * `getControlValue` only exists on 1.13.0+, and `minAppVersion` is 1.7.2.
	 * Nothing reaches the fallback anyway — the only keys ever passed are the
	 * control keys declared in `getSettingDefinitions()` above.
	 */
	getControlValue(key: string): unknown {
		switch (key) {
			case "serverUrl":
				return this.plugin.settings.serverUrl;
			case "username":
				return this.plugin.settings.username;
			case "coverStyle":
				return this.plugin.settings.coverStyle;
		}
		return undefined;
	}

	/**
	 * Persist a declarative control's value, mirroring the imperative handlers.
	 * Unknown keys are ignored rather than delegated up — see the note on
	 * `getControlValue`.
	 */
	async setControlValue(key: string, value: unknown): Promise<void> {
		switch (key) {
			case "serverUrl":
				this.plugin.settings.serverUrl = String(value).trim();
				break;
			case "username":
				this.plugin.settings.username = String(value);
				break;
			case "coverStyle":
				this.plugin.settings.coverStyle = value as CoverStyle;
				break;
			default:
				return;
		}
		await this.plugin.saveSettings();
		// The cover is built once per render, so a style change needs a rebuild.
		if (key === "coverStyle") this.plugin.refreshNowPlaying();
	}

	/**
	 * Imperative fallback for Obsidian older than 1.13.0 — `minAppVersion` is
	 * 1.7.2, so this still has to work. Obsidian skips it entirely once
	 * `getSettingDefinitions()` returns rows, so the two never both render.
	 */
	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Server URL")
			.setDesc("Your Navidrome server, e.g. https://music.example.com")
			.addText((text) =>
				text
					.setPlaceholder("https://music.example.com")
					.setValue(this.plugin.settings.serverUrl)
					.onChange(async (value) => {
						this.plugin.settings.serverUrl = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName("Username").addText((text) =>
			text
				.setPlaceholder("username")
				.setValue(this.plugin.settings.username)
				.onChange(async (value) => {
					this.plugin.settings.username = value;
					await this.plugin.saveSettings();
				})
		);

		this.buildPasswordSetting(
			new Setting(containerEl).setName("Password").setDesc(PASSWORD_DESC)
		);

		new Setting(containerEl)
			.setName("Cover style")
			.setDesc(COVER_STYLE_DESC)
			.addDropdown((drop) =>
				drop
					.addOption("vinyl", "Vinyl")
					.addOption("square", "Square")
					.addOption("waveform", "Waveform")
					.setValue(this.plugin.settings.coverStyle)
					.onChange(async (value) => {
						this.plugin.settings.coverStyle = value as CoverStyle;
						await this.plugin.saveSettings();
						this.plugin.refreshNowPlaying();
					})
			);

		this.buildTestConnectionSetting(
			new Setting(containerEl)
				.setName("Test connection")
				.setDesc("Ping the server with the current credentials.")
		);
	}

	// --- shared row builders -------------------------------------------------
	// Used by both the declarative `render` callbacks and display(), so the two
	// paths can't drift apart.

	private buildPasswordSetting(setting: Setting): void {
		setting.addText((text) => {
			text
				.setPlaceholder("password")
				.setValue(this.plugin.settings.password)
				.onChange(async (value) => {
					this.plugin.settings.password = value;
					await this.plugin.saveSettings();
				});
			text.inputEl.type = "password";
		});
	}

	private buildTestConnectionSetting(setting: Setting): void {
		setting.addButton((btn) =>
			btn
				.setButtonText("Test connection")
				.setCta()
				.onClick(async () => {
					btn.setDisabled(true).setButtonText("Testing…");
					const result = await this.testConnection();
					btn.setDisabled(false).setButtonText("Test connection");
					new Notice(result, result.startsWith("✓") ? 4000 : 8000);
				})
		);
	}

	private async testConnection(): Promise<string> {
		try {
			const client = new SubsonicClient(this.plugin.settings);
			await client.ping();
			return "✓ Connected to Navidrome successfully.";
		} catch (e) {
			if (e instanceof SubsonicError) {
				switch (e.kind) {
					case "config":
						return `✗ ${e.message}`;
					case "auth":
						return `✗ Authentication failed: ${e.message}`;
					case "unreachable":
						return `✗ Could not reach server: ${e.message}`;
					default:
						return `✗ Server error: ${e.message}`;
				}
			}
			return `✗ Unexpected error: ${(e as Error).message}`;
		}
	}
}

const PASSWORD_DESC =
	"Used to derive a salted token per request — the raw password is never sent over the wire, and is stored only in this vault's plugin data.";

const COVER_STYLE_DESC =
	"How the cover is displayed in Now Playing: spinning vinyl, a static square, or a live waveform.";
