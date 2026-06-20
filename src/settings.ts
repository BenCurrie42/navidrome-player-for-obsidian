import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type NavidromePlugin from "../main";
import { SubsonicClient, SubsonicError } from "./subsonic";

export class NavidromeSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: NavidromePlugin) {
		super(app, plugin);
	}

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

		new Setting(containerEl)
			.setName("Password")
			.setDesc(
				"Used to derive a salted token per request — the raw password is never sent over the wire, and is stored only in this vault's plugin data."
			)
			.addText((text) => {
				text
					.setPlaceholder("password")
					.setValue(this.plugin.settings.password)
					.onChange(async (value) => {
						this.plugin.settings.password = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.type = "password";
			});

		new Setting(containerEl)
			.setName("Test connection")
			.setDesc("Ping the server with the current credentials.")
			.addButton((btn) =>
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
