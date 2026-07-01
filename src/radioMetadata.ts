/**
 * Best-effort "now playing" for internet radio via ICY (SHOUTcast/Icecast)
 * in-band metadata.
 *
 * The HTML5 <audio> element strips ICY metadata, so we open a second,
 * short-lived connection to the stream with `Icy-MetaData: 1`, read
 * `icy-metaint` bytes of audio, then parse the interleaved
 * `StreamTitle='Artist - Title'` block. The connection is cancelled as soon as
 * a title is found, and re-opened on an interval to catch song changes.
 *
 * This is inherently best-effort: many stations omit ICY metadata, and some
 * block cross-origin reads (CORS). In those cases the poller yields nothing and
 * the caller falls back to showing just the station name.
 */
export class RadioMetadataPoller {
	private abort: AbortController | null = null;
	private timer: number | null = null;
	private stopped = false;
	private lastTitle: string | null = null;

	constructor(
		private url: string,
		private onTitle: (title: string | null) => void,
		private intervalMs = 15000
	) {}

	start() {
		this.stopped = false;
		void this.poll();
	}

	stop() {
		this.stopped = true;
		if (this.timer !== null) {
			window.clearTimeout(this.timer);
			this.timer = null;
		}
		if (this.abort) {
			this.abort.abort();
			this.abort = null;
		}
	}

	private schedule() {
		if (this.stopped) return;
		this.timer = window.setTimeout(() => void this.poll(), this.intervalMs);
	}

	private async poll() {
		if (this.stopped) return;
		this.abort = new AbortController();
		try {
			const res = await fetch(this.url, {
				headers: { "Icy-MetaData": "1" },
				signal: this.abort.signal,
			});
			const metaintHeader = res.headers.get("icy-metaint");
			if (!res.body || !metaintHeader) {
				// Stream advertises no in-band metadata; nothing to read this cycle.
				this.finishCycle(null);
				return;
			}
			const metaint = parseInt(metaintHeader, 10);
			const title =
				Number.isFinite(metaint) && metaint > 0
					? await this.readFirstTitle(res.body, metaint)
					: null;
			this.finishCycle(title);
		} catch {
			// CORS, network failure, or our own abort — stay silent.
			this.finishCycle(null);
		}
	}

	private finishCycle(title: string | null) {
		if (this.abort) {
			this.abort.abort();
			this.abort = null;
		}
		if (this.stopped) return;
		if (title !== null && title !== this.lastTitle) {
			this.lastTitle = title;
			this.onTitle(title || null);
		}
		this.schedule();
	}

	/**
	 * Read from the stream until the first non-empty metadata block, parse its
	 * StreamTitle, and return it. Gives up after a few intervals' worth of bytes
	 * so we never download more than necessary.
	 */
	private async readFirstTitle(
		body: ReadableStream<Uint8Array>,
		metaint: number
	): Promise<string | null> {
		const reader = body.getReader();
		let audioRemaining = metaint;
		let metaLength = -1; // -1 = next byte is the length byte
		const metaBytes: number[] = [];
		const maxBytes = (metaint + 16 * 255) * 4 + 4096; // safety cap
		let consumed = 0;
		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (done || !value) return null;
				for (let i = 0; i < value.length; i++) {
					consumed++;
					if (audioRemaining > 0) {
						audioRemaining--;
						continue;
					}
					if (metaLength === -1) {
						metaLength = value[i] * 16;
						if (metaLength === 0) {
							// Empty block — reset and wait for the next interval.
							audioRemaining = metaint;
							metaLength = -1;
						}
						continue;
					}
					metaBytes.push(value[i]);
					if (metaBytes.length >= metaLength) {
						const text = new TextDecoder("utf-8").decode(
							Uint8Array.from(metaBytes)
						);
						return parseStreamTitle(text);
					}
				}
				if (consumed > maxBytes) return null;
			}
		} finally {
			try {
				await reader.cancel();
			} catch {
				/* already closed */
			}
		}
	}
}

/** Pull `Artist - Title` out of an ICY metadata block. */
export function parseStreamTitle(meta: string): string | null {
	const m = meta.match(/StreamTitle='([^']*)'/);
	if (!m) return null;
	const t = m[1].trim();
	return t.length ? t : null;
}
