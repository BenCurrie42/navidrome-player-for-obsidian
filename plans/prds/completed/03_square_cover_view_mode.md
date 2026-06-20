# PRD-03: Square (Spotify-style) cover view mode

**Source:** v0.1.0 user feedback (`Feedback.md` → feature requests, and the B5 aspiration).
**Type:** Feature.

## Context

The default Now Playing surface is a round, spinning vinyl disc. The user wants the option of
a **square album-cover view** like Spotify and most players — a static (or subtly animated)
square cover instead of the spinning record — selectable in settings. This pairs with PRD-01's
layout fix to give a clean "full-screen Spotify" feel when the view is enlarged.

## Scope

- A new setting **"Cover style"** with two choices: **Vinyl** (default, current behavior) and
  **Square**. Implemented as a dropdown (or toggle) in the settings tab.
- In **Square** mode the Now Playing cover renders as a rounded **square** image (no spin, no
  vinyl disc shape). Everything else (transport, metadata, seek, queue) is unchanged.
- In **Vinyl** mode behavior is exactly v0.1.0 (round disc, spins while playing) plus the
  optional tonearm from PRD-02.
- Mode is persisted and applied on load.

## Proposed changes

- **`src/types.ts`** — add `coverStyle: "vinyl" | "square"` to `NavidromeSettings`; default `"vinyl"` in `DEFAULT_SETTINGS`.
- **`src/settings.ts`** — add a `Setting().addDropdown(...)` (Vinyl / Square); persist via `saveSettings()` and prompt a view re-render on change.
- **`src/tabs/nowPlaying.ts`** — read `coverStyle` in `build()`/`render()`. Toggle a class on the cover element (`is-vinyl` vs `is-square`). In square mode, skip the spin class entirely (the disc/`updateSpin` is a no-op). Keep the same `<img>` element; only its shape/animation differs.
- **`styles.css`** — add `.navidrome-disc.is-square { border-radius: var(--radius-m); animation: none; }` (overriding the circle + spin). Ensure the square scales with PRD-01's responsive sizing (`width: min(80%, 360px)`).

## Interaction with PRD-02
- The vinyl tonearm (PRD-02) only renders in **Vinyl** mode. In Square mode it is hidden
  regardless of the tonearm toggle.

## Acceptance criteria
- [ ] Settings has a "Cover style" choice (Vinyl default / Square).
- [ ] Square mode shows a static rounded-square cover, no spin; the disc/tonearm vinyl chrome is gone.
- [ ] Vinyl mode is unchanged from v0.1.0 (round, spins while playing).
- [ ] The chosen style persists across restarts and applies on load.
- [ ] Square mode looks clean when the view is enlarged (works with PRD-01's layout fix); no horizontal scroll.
- [ ] `npm run build` passes; no console errors.

## Out of scope
- Other layouts (e.g. mini/compact bar); only Vinyl ↔ Square for now.
- Animated transitions between the two styles.
