# Changelog

All notable changes to Navidrome Player are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.1.1]: https://github.com/BenCurrie42/navidrome-player-for-obsidian/releases/tag/0.1.1
[0.1.0]: https://github.com/BenCurrie42/navidrome-player-for-obsidian/releases/tag/0.1.0
