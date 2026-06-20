# PRD-01: Playback-state, shuffle-feedback, and layout bug fixes

**Source:** v0.1.0 user feedback (`Feedback.md` → bugs). **Type:** Bug fixes.

## Context

v0.1.0 "just worked," but five bugs surfaced in real use. Four are UI-state/correctness
issues in the Now Playing tab; one is a layout issue when the view is enlarged. They are
grouped here because the first three share a single root cause.

## Bugs & root causes

### B1 — Play button looks paused & disc never spins when starting playback
When playing from the Library or the up-next queue, the play/pause button stays on the
"play" (paused) glyph and the cover never starts spinning, even though audio is playing.

**Root cause:** `Player.isPlaying` in `src/player.ts` requires `audio.readyState > 0`:
```ts
get isPlaying() { return !this.audio.paused && !this.audio.ended && this.audio.readyState > 0; }
```
When a fresh stream URL is loaded, the `play` event fires *before* the media buffers, so
`readyState` is still `0` (`HAVE_NOTHING`). `isPlaying` therefore returns `false` at the
moment the UI re-renders. The player only re-emits change events on `play`/`pause` — **not**
on `playing` — so once `readyState` climbs there is no further re-render to correct the
button glyph or start the disc spin.

### B2 — Sometimes must double-click play to start
**Root cause:** same as B1. The stale UI shows "paused" while audio is actually playing.
The first click runs `togglePlay()`, which sees `isPlaying === true` (audio not paused) and
**pauses**; the second click plays again. Fixing B1 fixes B2.

### B3 — Same paused-looking bug when skipping a song
**Root cause:** same as B1 — `next()`/`prev()` call `playCurrent()`, which sets a new src and
hits the same `readyState` race.

### B4 — Shuffle gives no indication it was activated
Hitting shuffle produces no visible feedback. Shuffle is a **one-shot** action (it shuffles
the current queue in place — PRD FR-20), not a persistent mode, so there is nothing to leave
"on." The fix is immediate confirmation feedback, not a persistent toggle state. add an animation to the shuffle button so the user knows it was clicked.

### B5 — Player balloons / doesn't reflow when the view is enlarged
When the sidebar is widened or the view is popped out larger, the layout grows awkwardly
instead of staying tidy. The Now Playing column has no max-width, so content stretches across
the full pane with the disc stranded in a large empty area.

## Proposed changes

### Fix B1–B3 (`src/player.ts`)
- Redefine playing state by intent, not buffer level:
  ```ts
  get isPlaying() { return !this.audio.paused && !this.audio.ended; }
  ```
- Add listeners that re-emit on the events that actually change perceived play state, so the
  UI self-corrects through buffering:
  ```ts
  this.audio.addEventListener("playing", () => this.emit());
  this.audio.addEventListener("waiting", () => this.emit());
  ```
  (Keep existing `play`/`pause`/`ended` listeners.)

### Fix B3 spin specifically (`src/tabs/nowPlaying.ts`)
- `bindAudio()` already toggles spin on `play`/`pause`; also toggle on `playing` so the disc
  starts spinning the instant audio truly begins after a skip. `render()`'s `updateSpin()`
  call now reads the corrected `isPlaying`, so the glyph and spin agree.

### Fix B4 — shuffle feedback (`src/tabs/nowPlaying.ts`, `styles.css`)
- On shuffle click: show a `new Notice("Queue shuffled")` and briefly flash the shuffle
  button (add an `is-flash` class for ~600ms, then remove it).
- Add a `.navidrome-btn.is-flash` rule (e.g. accent color + short transition) in `styles.css`.
- **Animate the shuffle button on click** so the user gets unmistakable feedback that it
  fired (per the added requirement). In the click handler, add a short-lived `is-shuffling`
  class to `this.shuffleBtn`, then remove it on `animationend` (with a `setTimeout` fallback
  in case the event doesn't fire). In `styles.css`, define a `@keyframes navidrome-shuffle`
  that spins/wobbles the icon once — e.g. a 360° rotate plus a slight scale pop over ~500ms,
  `ease-in-out` — and apply it via `.navidrome-btn.is-shuffling { animation: navidrome-shuffle 0.5s ease-in-out; }`.
  Re-trigger reliably on rapid repeat clicks by removing the class before re-adding it (force
  reflow) so the animation restarts each press. Combine with the `is-flash` accent so the
  button both spins and highlights momentarily.

### Fix B5 — responsive layout (`styles.css`)
- Constrain the Now Playing column to a centered max-width so it stays a tidy column on wide
  panes: `.navidrome-nowplaying { max-width: 460px; margin: 0 auto; }`.
- Make the disc scale with available space up to a larger cap for the enlarged/"full-screen"
  feel: `.navidrome-disc { width: min(80%, 360px); }` (replacing `width: 70%; max-width: 220px`).
- Guarantee no horizontal scroll at any width (`overflow-x: hidden` already on `.navidrome-tabbody`; verify the album grid `minmax` doesn't force overflow on very narrow widths — drop min to ~96px if needed).

> Note: B5's "make it look like full-screen Spotify" aspiration is addressed structurally
> here (tidy, centered, scalable). The optional square/album visual style is **PRD-03**.

## Acceptance criteria
- [ ] Starting playback from Library or the up-next queue immediately shows the pause glyph and spins the disc.
- [ ] A single click of play starts paused audio; no double-click needed.
- [ ] Skipping to next/previous immediately reflects playing state (glyph + spin).
- [ ] Hitting shuffle shows clear feedback: the button plays a short click animation (and flashes/Notice), and the animation restarts on rapid repeat clicks.
- [ ] Widening the sidebar or enlarging the view keeps a tidy, centered layout with the disc scaling sensibly; no horizontal scroll at any width.
- [ ] `npm run build` passes; no console errors on load.

## Out of scope
- Persistent "shuffle mode" behavior (this stays one-shot).
- Vinyl tonearm (PRD-02) and square/Spotify cover mode (PRD-03).
