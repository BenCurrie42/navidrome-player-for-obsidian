# Navidrome Player — Product Requirements Document

**Owner:** Ben · **Target:** v0.1 (MVP) · **Platform:** Obsidian desktop only

Companion docs: `/Users/benjamincurrie/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian/10_Active/Personal/Navidrome Obsidian Plugin/MVP.md` (scope cut) · `/Users/benjamincurrie/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian/10_Active/Personal/Navidrome Obsidian Plugin/Tech Stack.md` (implementation) · `/Users/benjamincurrie/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian/10_Active/Personal/Navidrome Obsidian Plugin/Navidrome music player obsidian plugin.md` (original idea).

---

## 1. Overview

Navidrome Player is an Obsidian-native plugin that docks a music player in the right sidebar, connects to any Navidrome (Subsonic API) server, and plays your library at full quality — so you never have to leave your vault to control your music. It uses native Obsidian UI throughout: configuration lives in a tab in Obsidian's own settings, and the player is a single sidebar view split into two tabs — **Library** and **Now Playing**. Its signature surface is a spinning album cover for the current track.

## 2. Problem & motivation

Listening while working in Obsidian means context-switching to a browser tab or a separate app to skip a track, change an album, or start a playlist. That breaks focus. Self-hosted music lovers already run Navidrome; the Subsonic API it exposes is open and well-documented. A lightweight in-vault player closes the loop: music control lives in the same window as the notes.

## 3. Goals & non-goals

### Goals

- A genuinely usable daily-driver player that lives in the Obsidian sidebar.
- Connect to any Navidrome server with minimal setup (URL + username + password).
- Full-quality, no-downgrade playback.
- Playback that never interrupts when navigating notes.
- Transparent about what it stores on the user's machine.

### Non-goals (MVP)

- Replacing a full-featured music client (search, library management, tagging).
- Mobile support.
- Social/sharing features, scrobbling, lyrics.
- Offline downloads.

## 4. Target user

A self-hoster who runs Navidrome and lives in Obsidian during deep-work sessions. Comfortable entering a server URL and credentials. Wants ambient control of their own library without leaving the vault. (Initial user: the author.)

## 5. Platform & constraints

- **Desktop only** for MVP (`isDesktopOnly: true` in the manifest). Mobile is out of scope until the audio path is validated there.
- Runs inside Obsidian's Electron/Chromium runtime; relies on it for audio decoding.
- **Codec floor:** mp3 and wav must play. FLAC/AAC expected to work via Chromium but are not the guaranteed floor.

## 6. Functional requirements

### 6.1 Settings (Obsidian native)

- **FR-1** Configuration lives in a **tab in Obsidian's own Settings panel** (a `PluginSettingTab`), not a custom modal. It collects: server URL, username, password.
- **FR-2** Authentication uses Subsonic **token auth** — the password derives a salted token; the raw password is never sent over the wire.
- **FR-3** A "Test connection" action pings the server and reports clear success or failure (bad URL, bad credentials, unreachable).
- **FR-4** Credentials and settings persist via Obsidian plugin data.

### 6.2 Sidebar player view (two tabs)

- **FR-5** The player is a single custom view docked in the **right sidebar** (same dock region as the calendar plugin), built with native Obsidian UI patterns.
- **FR-6** The view is persistent: switching or closing notes never interrupts playback.
- **FR-7** The view has **two tabs** the user switches between: **Library** and **Now Playing**. The active tab is remembered across restarts; playback continues regardless of which tab is shown.

#### Now Playing tab

- **FR-8** The primary visual is the **current track's album cover, spinning while playing** and pausing its spin when audio is paused.
- **FR-9** Transport controls: play/pause, next, previous, a seek/scrub bar, and volume.
- **FR-10** Now-playing metadata: track title, artist, album.
- **FR-11** Shows the upcoming queue beneath the controls.

#### Library tab

- **FR-12** **Album view:** a grid/list of albums with cover art.
- **FR-13** **Artist view:** a list of artists, each expandable to their albums.
- **FR-14** **Playlists:** lists the server's playlists.
- **FR-15** Selecting an album or playlist loads its tracks into the queue and begins playback; selecting it does not force a tab switch (the user can pop over to Now Playing themselves).

### 6.3 Playback

- **FR-16** Stream at original/maximum quality — no server-side transcode-down.
- **FR-17** Sequential playback through a queue; advancing to the next track is automatic on track end.
- **FR-18** The current queue and playback position persist across Obsidian restarts (best effort).
- **FR-19** Prefetch one track ahead for snappy transitions.

### 6.4 Playback modes

- **FR-20** **Shuffle** — shuffle the current queue.
- **FR-21** **Random (vibes) mode** — continuously plays random songs drawn from the entire library, refilling the queue as it drains.

## 7. UX requirements

- The view fits a narrow sidebar column without horizontal scroll.
- Tab switching (Library ↔ Now Playing) uses a native-feeling Obsidian tab/segmented control at the top of the view; the inactive tab's scroll position is preserved when returning to it.
- Cover-art spin animates **only** while audio is actually playing (driven by play/pause events).
- Honors Obsidian theme variables (light/dark, accent) so it blends with the user's vault.
- Errors (connection lost, stream failure) surface inline, not silently.

## 8. Technical summary

Full detail in `/Users/benjamincurrie/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian/10_Active/Personal/Navidrome Obsidian Plugin/Tech Stack.md`. Key points:

- **TypeScript + esbuild**, built from the official `obsidian-sample-plugin` config.
- Settings via a `PluginSettingTab` in Obsidian's native Settings panel.
- Player is a single custom `ItemView` on the right leaf, internally rendering a **Library** tab and a **Now Playing** tab; state held in a single plain-TS queue/player store shared across both tabs.
- **HTML5 `<audio>`** for streaming and transport; CSS `@keyframes` for the disc spin.
- Thin typed **Subsonic `fetch` client**. MVP endpoints: `ping`, `getAlbumList2`, `getArtists`/`getArtist`, `getAlbum`, `getCoverArt`, `stream`, `getRandomSongs`, `getPlaylists`/`getPlaylist`.
- Token derived via the platform `crypto` module; near-zero runtime dependencies.

## 9. Data, privacy & transparency

- **FR-22** All plugin data — cover-art cache and persisted state — lives in a **single explicit plugin data directory**. Nothing is written elsewhere on the user's machine.
- **FR-23** The README documents exactly what is stored and where, so users can see precisely what the plugin does on their computer.
- Credentials are stored locally in plugin data; the plugin talks only to the user's configured server.

## 10. Build order (suggested milestones)

1. **Scaffold** — plugin skeleton, native settings tab, right-leaf view shell with the two-tab (Library / Now Playing) chrome.
2. **Connect** — Subsonic client + token auth + "Test connection".
3. **Play one track** — `stream` a single song through the `<audio>` element with transport controls.
4. **Now Playing tab** — metadata display, the play/pause-driven spinning cover, and the upcoming-queue list.
5. **Queue** — sequential playback, next/prev, prefetch one ahead, persistence across restart.
6. **Library tab — browse** — album view, then artist view, with cover art; click-to-play.
7. **Modes** — shuffle, then Random (vibes) with auto-refill.
8. **Library tab — playlists** — list and play.
9. **Polish** — tab state persistence, theming, error states, README data-transparency section.

## 11. Acceptance criteria (MVP done)

- [ ] Plugin loads with no console errors on a clean desktop Obsidian install.
- [ ] Settings appear as a tab in Obsidian's native Settings panel.
- [ ] Token-auth connection to a real Navidrome server succeeds; bad credentials surface a clear error.
- [ ] Sidebar view shows Library and Now Playing tabs; switching tabs never interrupts playback, and the active tab is restored on restart.
- [ ] Sidebar view persists and keeps playing while navigating between notes.
- [ ] Album cover animates only while audio is actually playing.
- [ ] Streams play at original quality (request asks for no/zero-cap transcoding); mp3 and wav both play.
- [ ] Album and artist views load cover art and are navigable.
- [ ] Shuffle, Random (vibes), and playlist playback each work end to end.
- [ ] Queue and playback position survive an Obsidian restart.
- [ ] All written data is confined to the documented plugin data directory.

## 12. Risks

- **Subsonic auth variation** across Navidrome versions — token auth for MVP; revisit if a target server rejects it.
- **Codec support** — mp3/wav are the floor; exotic formats depend on Chromium and are not guaranteed.
- **Gapless feel** — single-track prefetch may not be fully gapless; acceptable for MVP, revisit with Web Audio if needed.

## 13. Post-MVP (deferred)

Starring/favorites · the "vibing character" companion animation · in-app playlist creation/editing · search · mobile support · offline caching · lyrics · scrobbling · multi-server switching.
