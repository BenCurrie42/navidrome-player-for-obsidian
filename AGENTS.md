# navidrome-obsidian — Project & Agent Ruleset

This document is binding for all AI agents working in this repo.

## 1. Project Overview

Navidrome Player is a **desktop-only Obsidian plugin** that docks a music player in the
right sidebar, connects to a [Navidrome](https://www.navidrome.org/) server over the
Subsonic API (token auth), and streams the library at full quality so the user never
leaves their vault. It's a single custom `ItemView` with three tabs — **Now Playing**
(spinning/square/waveform cover art, transport), **Queue** (up-next list), and **Library**
(albums, artists, playlists, and a Radio subview for saved internet stations) — plus a
library search bar that overlays results across the tabs. It's backed by a plain-TS
queue/player store, an HTML5 `<audio>` element, and a thin typed Subsonic
`fetch`/`requestUrl` client. The product spec lives in `prd.md`.

- **Language / Framework:** TypeScript (strict). Obsidian plugin API; no UI framework — plain DOM via `createEl`. CSS in `styles.css`.
- **Package manager / runner:** npm
- **Bundler:** esbuild (`esbuild.config.mjs`), output to `main.js`.
- **Testing:** No automated test suite. Verification is type-check + build + **manual testing against a real Navidrome server** (PRD §11 acceptance criteria).
- **Environment wrapper:** none

## 2. Core Principles

- **Iterative development:** small, logical, self-contained increments.
- **Spec-first:** behavior is defined by `prd.md` (and its companion MVP / Tech Stack docs); confirm scope against it before implementing.
- **Near-zero runtime deps:** lean on the platform (Electron/Chromium for audio, Node `crypto` for hashing, Obsidian for UI). Add a runtime dependency only with explicit approval.
- **Native-feeling UI:** honor Obsidian theme CSS variables; build with Obsidian UI patterns.

## 3. Mandatory Quality Gates

Code is not "done" until ALL pass:

1. **Type-check + build:** `npm run build` (runs `tsc -noEmit -skipLibCheck` then esbuild) succeeds with **no errors**. `tsconfig` is strict, with `noUnusedLocals`/`noUnusedParameters` on.
2. **Manual verification:** the relevant PRD §11 acceptance criteria pass against a real Navidrome server (e.g. connection test, playback, cover-spin-only-while-playing, persistence across restart).
3. **No console errors:** the plugin loads cleanly in desktop Obsidian (PRD §11 first criterion).

> No automated test runner, coverage tooling, or linter is configured in this repo. Do **not** invent `npm test`/`npm run lint` commands. If a gate of that kind is wanted, propose adding the tooling first.

## 4. Change Lifecycle

1. **Scope:** check the change against `prd.md`. If it's net-new scope, confirm with the operator first.
2. **Branch:** this repo is **not yet a git repository**. If/when it is initialized, work on a feature branch and **never** push to `main` without approval.
3. **Implement:** make the change in `main.ts` / `src/`, following section 5.
4. **Verify:** run `npm run build` (gate 1) and manually verify the affected behavior (gate 2).
5. **Install to test:** copy `main.js`, `manifest.json`, `styles.css` into the test vault's `.obsidian/plugins/navidrome_player/` and reload the plugin in Obsidian.
6. **PR / commit:** commit or push only after explicit operator approval.

## 5. Conventions

- **Indentation:** tabs (matches `obsidian-sample-plugin` and existing source).
- **Networking:** JSON Subsonic calls go through Obsidian's `requestUrl` (bypasses CORS for arbitrary servers). Media (`stream`, `getCoverArt`) is loaded **directly** by `<audio>`/`<img>` element `src` — no CORS needed. See `src/subsonic.ts`.
- **Auth:** token auth only — `md5(password + salt)` via Node `crypto`, fresh salt per request. The raw password is never sent over the wire.
- **Streaming quality:** always request original quality (`format=raw`, `maxBitRate=0`); never transcode down.
- **Theming:** style exclusively with Obsidian CSS variables (`--background-*`, `--text-*`, `--interactive-accent`, etc.) so the plugin blends with any theme.
- **State:** all playback/queue state lives in the single `Player` store (`src/player.ts`); both tabs subscribe to it. Persist via `saveData()` only.
- **Data transparency:** all persisted data stays in the plugin's `data.json`; cover art is cached in memory only. Keep the README's "Data, privacy & transparency" section accurate to what the code actually writes.
- **Commits:** natural-language summary describing the change. No conventional-commit prefixes.

## 6. Agent Constraints

- **NEVER** bypass the quality gates in section 3.
- **NEVER** commit or push without explicit operator approval.
- **NEVER** add a runtime dependency without approval (the project targets near-zero runtime deps).
- **NEVER** write plugin data anywhere outside the documented `data.json` (data-transparency guarantee).
- **NEVER** weaken the auth model (no plaintext password over the wire) or remove `isDesktopOnly` without approval.
- **Stop on blocked workflows:** if a tool needs interactive input or is blocked (e.g. live-server testing without credentials), do NOT hack around it. Stop, explain, and ask for guidance.

## 7. Definition of Done

Success is strictly bound to the Quality Gates in section 3: a clean `npm run build`,
manual verification of the affected behavior against a real Navidrome server, and no
console errors on load. Do not signal completion until every applicable gate is met.
