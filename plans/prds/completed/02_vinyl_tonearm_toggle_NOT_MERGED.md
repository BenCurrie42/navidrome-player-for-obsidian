# PRD-02: Vinyl tonearm toggle

**Source:** v0.1.0 user feedback (`Feedback.md` → feature requests). **Type:** Feature.

## Context

The signature surface is the spinning album cover styled as a vinyl disc. The user wants an
optional **tonearm** that adds to the record-player feel: when the disc starts spinning the
arm swings onto the record; when playback stops the arm swings back off to the side. This is
purely cosmetic and must be **off by default** and toggleable in settings.

## Scope

- A new setting **"Show vinyl tonearm"** (boolean, default `false`) in the Navidrome Player
  settings tab.
- When enabled, render a tonearm over/around the disc in the Now Playing tab.
- Arm animates **on** (rests on the disc) while audio is actually playing and **off** (swings
  to the resting position) when paused/stopped — driven by the same play/pause state used for
  the disc spin (so it stays in sync after PRD-01's fix).
- When the setting is disabled, no arm is rendered.

## Proposed changes

- **`src/types.ts`** — add `showTonearm: boolean` to `NavidromeSettings`; default `false` in `DEFAULT_SETTINGS`.
- **`src/settings.ts`** — add a `Setting().addToggle(...)` for "Show vinyl tonearm"; persist via `saveSettings()`. On change, notify the open view so it can re-render (e.g. via a plugin callback or by re-reading the setting in `NowPlayingTab.render()`).
- **`src/tabs/nowPlaying.ts`** — in `build()`, create a tonearm element inside `.navidrome-cover-wrap` (hidden when the setting is off). Add/remove an `is-on` class on the arm in `updateSpin()` (and `render()`), keyed to `player.isPlaying`. Read the toggle through the existing `getClient`-style accessor pattern or a new `getSettings()` callback passed from the view/plugin.
- **`styles.css`** — `.navidrome-tonearm` positioned at the disc's edge with a transform-origin at its pivot; `transform: rotate(...)` for resting vs engaged angles; `transition` for the swing. Use an SVG or a simple styled element; no external assets (CSP/offline-safe). Respect Obsidian theme variables for color.

## Acceptance criteria
- [ ] Settings has a "Show vinyl tonearm" toggle, default off.
- [ ] With it off, no arm appears (v0.1.0 look unchanged).
- [ ] With it on, the arm swings onto the disc when audio plays and back off when paused/stopped, in sync with the spin.
- [ ] Toggling the setting updates an already-open player view without requiring a reload (or, if a reload is needed, that's documented).
- [ ] No external/network assets; `npm run build` passes; no console errors.

## Out of scope
- Square/Spotify cover mode (PRD-03) — the arm only applies to vinyl mode.
- Realistic audio/scratch effects.
