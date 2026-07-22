# Changelog

All notable changes to Navidrome Player are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.6] - 2026-07-22

Maintenance release addressing Obsidian community-review lint findings.

### Changed

- **Auth crypto is now dependency-free and portable** — the Subsonic auth token no longer uses
  Node's `crypto` module (`createHash` / `randomBytes`), which the community review flagged as
  unsafe `any`-typed calls and a desktop-only Node dependency. The salt is now derived from the
  Web Crypto API (`crypto.getRandomValues`) and the token from a small vendored MD5
  (`src/md5.ts`). The token formula is unchanged (`md5(password + salt)`), so existing servers
  and credentials keep working.

### New files

- `src/md5.ts` — pure-TypeScript MD5 (RFC 1321) used to derive the Subsonic auth token; verified
  against Node's `crypto` for ASCII, multi-byte UTF-8, and block-boundary inputs.

## [0.1.5] - 2026-07-22

Polish release: the Now Playing tab no longer looks stretched in a full-height sidebar.

### Fixed

- **Stretched Now Playing layout in a tall sidebar** — in a tall/maximized sidebar,
  `.navidrome-cover-wrap` was the only `flex: 1 1 auto` element, so it absorbed all leftover
  vertical space: the album art floated at the top, a dead gap sat below it, and the transport
  controls hugged the bottom edge. The cluster (cover + title + controls) is now vertically
  centered as one unit and the artwork sizes to its own content
  (`styles.css`): `.navidrome-nowplaying` gains `justify-content: safe center` (centers when
  there's room, falls back to top-aligned + scrollable on short panes so the top is never
  clipped); `.navidrome-cover-wrap` becomes `flex: 0 0 auto`; and `.navidrome-disc` /
  `.navidrome-waveform` switch to width-driven sizing capped at `min(100%, 360px)` with
  `aspect-ratio: 1 / 1` — filling the width in a narrow pane, capped on large screens.

## [0.1.4] - 2026-07-16

Compliance release addressing the Obsidian community-plugin review.

### Changed

- **Obsidian API usage** — `minAppVersion` raised to `1.7.2` (the `revealLeaf` API is `@since 1.7.2`)
  and the `revealLeaf` call is now awaited (`main.ts`).
- **DOM visibility** — all direct `.style.display` assignments replaced with Obsidian's
  `hide()` / `show()` / `toggle()` helpers across `src/tabs/nowPlaying.ts`, `src/tabs/library.ts`,
  and `src/view.ts`.
- **Command metadata** — the plugin id/name prefix was dropped from the command id and name so
  Obsidian derives them (`main.ts`).
- **Build** — `builtin-modules` dependency replaced with Node's `module.builtinModules`
  (`esbuild.config.mjs`); `package.json` trimmed accordingly.
- **Author** — set to Ben Currie (`manifest.json`).

### Fixed

- **Radio metadata comment** — documented why the ICY metadata reader must use `fetch` rather than
  Obsidian's `requestUrl` (`src/radioMetadata.ts`).

## [0.1.3] - 2026-07-16

Polish release: the tab bar now stays readable in a narrow sidebar.

### Added

- **Responsive tab bar** — when the sidebar is narrowed past 220px, the three tab buttons
  (Now Playing / Queue / Library) collapse into a single full-width native `<select>` dropdown,
  and expand back into buttons when widened (`TABBAR_COLLAPSE_BREAKPOINT`, `src/view.ts`). A
  `ResizeObserver` on `.navidrome-tabbar` toggles an `is-collapsed` class; CSS handles the
  button/dropdown swap. The dropdown uses Obsidian's built-in `dropdown` class so it matches the
  theme in light and dark mode, carries an `aria-label`, and is kept in sync with the active tab
  inside `switchTab()`. Width `0` is ignored so entering/exiting search (which hides the bar)
  never thrashes the collapsed state; the observer is disconnected in `onClose()`.

## [0.1.2] - 2026-07-15

Feature release adding internet radio and library search (PRD-04, PRD-05).

### Added

- **Radio sub-tab** — a **Radio** subview under Library lists the internet radio stations saved on
  your server (`subsonic.getRadioStations()` → Subsonic `getInternetRadioStations`). Selecting one
  streams it live; radio queue entries carry `streamUrl` and `isRadio` so the player disables
  auto-advance, refill, and prefetch for live streams.
- **Live radio "now playing"** — best-effort track detection for streams via ICY
  (SHOUTcast/Icecast) in-band metadata (`RadioMetadataPoller`, `src/radioMetadata.ts`). Since the
  HTML5 `<audio>` element strips ICY metadata, a short-lived second connection reads `icy-metaint`
  bytes and parses the `StreamTitle='Artist - Title'` block, re-polling to catch song changes. Falls
  back to just the station name when a station omits metadata or blocks cross-origin reads.
- **Waveform cover style** — a new `waveform` `CoverStyle` (alongside `vinyl` and `square`) rendered
  in Now Playing, offered for music and used for radio; selectable in settings.
- **Library search** — a search bar above the tab bar (`src/tabs/search.ts`, `SearchController`)
  takes over the view with a full-view results overlay spanning artists, albums, and songs via
  Subsonic `search3` (new `subsonic.search3()` method). 250 ms debounce, 2-character minimum, and
  Escape / clear-button to dismiss; the underlying tab DOM is preserved so scroll position and
  playback are never disturbed.
- **Queue tab** — the up-next queue is now its own top-level tab (`src/tabs/queue.ts`) rather than
  living inside Now Playing.

### Changed

- **Now Playing layout** — cover art and waveform now scale to fill the pane, the always-on
  scrollbar is gone, and radio drops the queue chrome for a cleaner live view.
- **Tabs** — `TabId` is now `nowPlaying | queue | library` following the Queue split.

### New files

- `src/radioMetadata.ts` — ICY in-band metadata poller powering live radio "now playing".
- `src/tabs/queue.ts` — standalone Queue tab.
- `src/tabs/search.ts` — library search controller and results overlay.

## [0.1.1] - 2026-06-20

Bug-fix release from v0.1.0 user feedback (PRD-01).

### Fixed

- Play/pause button no longer gets stuck on the "play" glyph and the disc now starts spinning
  immediately when playback begins from the Library or the up-next queue. Playing state is now
  determined by playback intent rather than buffer readiness, and the UI re-renders on the
  `playing`/`waiting` audio events.
- Removed the double-click needed to start playback — a single click now reliably plays paused
  audio (same root cause as the stuck button).
- Skipping to the next/previous track now immediately reflects the correct playing state (button
  glyph and disc spin).
- Enlarging or widening the player view now keeps a tidy, centered layout that scales sensibly
  instead of ballooning; no horizontal scroll at any width.

### Added

- Shuffle button now plays a short spin/pop animation (and flashes) on click so it's clear the
  action fired, with the animation restarting on rapid repeat presses.

## [0.1.0] - 2026-06-20

Initial release.

### Added

- Sidebar player view docked in the right leaf with two tabs: **Now Playing** and **Library**.
- Now Playing: spinning album-cover art (spins only while audio plays), transport controls
  (play/pause, next, previous, seek, volume), track metadata, and the upcoming queue.
- Library: album grid, expandable artist list, and server playlists — click to load and play.
- Subsonic API client with token auth (`md5(password + salt)`; raw password never sent).
- Native settings tab (server URL / username / password) with a **Test connection** button.
- Full-quality streaming (`format=raw`, `maxBitRate=0`) — no server-side transcode-down.
- Shuffle and **Random (vibes)** mode with automatic queue refill.
- Persistence of queue, position, mode, volume, and active tab across Obsidian restarts.
- One-track-ahead prefetch for snappier transitions.

[0.1.6]: https://github.com/BenCurrie42/navidrome-player-for-obsidian/releases/tag/0.1.6
[0.1.5]: https://github.com/BenCurrie42/navidrome-player-for-obsidian/releases/tag/0.1.5
[0.1.4]: https://github.com/BenCurrie42/navidrome-player-for-obsidian/releases/tag/0.1.4
[0.1.3]: https://github.com/BenCurrie42/navidrome-player-for-obsidian/releases/tag/0.1.3
[0.1.2]: https://github.com/BenCurrie42/navidrome-player-for-obsidian/releases/tag/v0.1.2
[0.1.1]: https://github.com/BenCurrie42/navidrome-player-for-obsidian/releases/tag/0.1.1
[0.1.0]: https://github.com/BenCurrie42/navidrome-player-for-obsidian/releases/tag/0.1.0
