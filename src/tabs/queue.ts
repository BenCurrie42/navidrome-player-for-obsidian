import { Player } from "../player";

/** Queue tab: the full playback queue with the current track highlighted. */
export class QueueTab {
	private list!: HTMLElement;
	private unsubscribe: () => void;

	constructor(
		private root: HTMLElement,
		private player: Player
	) {
		this.build();
		this.unsubscribe = this.player.onChange(() => this.render());
		this.render();
	}

	destroy() {
		this.unsubscribe();
	}

	private build() {
		this.root.empty();
		this.root.addClass("navidrome-queue-tab");
		this.root.createEl("h4", { cls: "navidrome-queue-head", text: "Queue" });
		this.list = this.root.createDiv({ cls: "navidrome-queue" });
	}

	private render() {
		this.list.empty();

		if (this.player.current?.isRadio) {
			this.list.createDiv({
				cls: "navidrome-queue-empty",
				text: "A radio station is playing — no queue.",
			});
			return;
		}

		const q = this.player.queue;
		if (q.length === 0) {
			this.list.createDiv({ cls: "navidrome-queue-empty", text: "Queue is empty." });
			return;
		}

		q.forEach((t, i) => {
			const row = this.list.createDiv({ cls: "navidrome-queue-item" });
			row.toggleClass("is-current", i === this.player.index);
			row.createSpan({ cls: "navidrome-queue-title", text: t.title });
			if (t.artist) {
				row.createSpan({ cls: "navidrome-queue-artist", text: t.artist });
			}
			row.onclick = () => this.player.jumpTo(i);
		});
	}
}
