# PRD-04: Library search

**Source:** v0.1.0 user request — a clean, well-fitting search that lives above the tab bar and
takes over the view while searching.
**Type:** Feature.

## Context

There is no way to search the library today — you browse Albums / Artists / Playlists by scrolling.
For a large library that's slow. The user wants a **search bar that sits above the
Now Playing / Library tab bar** (`.navidrome-tabbar` in `src/view.ts`), scales with the sidebar
width, and — the moment you start searching — **expands to take over the whole view** with results,
collapsing back to normal when dismissed via an **✕ button on the right** of the field.

The Subsonic API already backs this: `search3` returns matching artists, albums, and songs in one
call. The client (`src/subsonic.ts`) doesn't expose it yet, so this PRD adds it.

## Scope

- A **search bar pinned at the very top of the view**, above the tab bar, present on both tabs.
  It is part of the view chrome (`src/view.ts`), not inside a tab.
- The field **scales with the sidebar width** (full width, sensible max), matching the existing
  clean look (same radii, spacing, and colors as the rest of the plugin).
- **Idle state:** just the input (with a search icon and placeholder), tab bar and the active tab
  visible below as normal.
- **Active state (searching):** as soon as the query is non-empty, a **full-view results overlay**
  covers the tabs and their content — a single scrollable results surface. An **✕ clear button**
  appears on the right of the input.
- **Dismiss:** clicking ✕ (or clearing the text, or pressing `Esc`) clears the query, hides the
  overlay, and returns to the normal tab view exactly as it was (tab selection and scroll
  preserved — the tab DOM is never torn down, only visually covered).
- **Results** are grouped **Artists / Albums / Songs**, each section shown **only** if it has hits.
  Clicking a result plays it (album/artist → load its tracks; song → play that track), reusing the
  existing `player.loadQueue(...)` path. Playing from a result **auto-dismisses search** and returns
  to the normal tab view.
- Search is **debounced** (~250 ms) and requires a minimum of 2 characters before querying.

## Proposed changes

- **`src/subsonic.ts`** — add
  `search3(query: string, opts?): Promise<{ artists: Artist[]; albums: Album[]; songs: Track[] }>`
  wrapping the `search3` method (`artistCount`/`albumCount`/`songCount` params, default ~20 each).
  Reuse the existing `toTrack` / `toAlbum` mappers and the `RawArtist` shape.
- **`src/view.ts`** — build the search bar in `onOpen()` as the **first child** of the container,
  before `.navidrome-tabbar`:
  - a `.navidrome-search` wrapper containing a search icon, an `<input type="search">`, and an
    `.navidrome-search-clear` ✕ button (hidden while empty).
  - an `.navidrome-search-results` overlay div (hidden by default) as a sibling of the tab bodies.
  - wire `input` (debounced), `Esc`, and the ✕ button to an `enterSearch()` / `exitSearch()` pair
    that toggles an `is-searching` class on the view root and shows/hides the overlay.
  - a small `SearchController` (new file `src/tabs/search.ts`, mirroring the tab classes) owns
    querying, rendering results into the overlay, and the click-to-play handlers; the view just
    hands it the overlay element, the player, and `getClient`.
- **`src/tabs/search.ts`** (new) — render grouped results, loading / empty / error states
  (reusing `.navidrome-loading`, `.navidrome-empty`, `.navidrome-error`, and `.navidrome-album-grid`
  where it fits), and the play handlers (`getAlbumTracks` → `loadQueue`, etc.).
- **`styles.css`** — style `.navidrome-search` (full width, `max-width`, rounded to match cards),
  the icon/clear affordances, and `.navidrome-view.is-searching .navidrome-tabbar`,
  `… .navidrome-tabbody { display: none }` plus `.navidrome-search-results` filling the view and
  scrolling. No horizontal scroll at any width.

## Interaction with existing tabs
- The tab DOM (`nowPlayingEl`, `libraryEl`) is only hidden while searching, never rebuilt, so
  Now Playing keeps playing and Library keeps its scroll/selection when search is dismissed.
- Switching tabs while search is active is not possible (the bar is hidden); dismiss first.

## Acceptance criteria
- [ ] A search field sits **above** the Now Playing / Library tab bar and is full-width, scaling
      with the sidebar, with a clean look consistent with the rest of the plugin.
- [ ] Typing ≥2 chars queries `search3` (debounced) and shows a full-view results overlay covering
      the tabs.
- [ ] Results are grouped Artists / Albums / Songs; empty sections are hidden; clicking a result
      plays it via the existing player path and auto-dismisses search back to the normal tab view.
- [ ] An ✕ button on the right of the field clears the query and returns to the normal tab view;
      `Esc` and clearing the text do the same.
- [ ] Dismissing search restores the prior tab and scroll position; playback is never interrupted.
- [ ] Loading / empty ("No results") / error states are handled.
- [ ] No horizontal scroll at any sidebar width; `npm run build` passes with no console errors.

## Out of scope
- Search history, suggestions/autocomplete, or fuzzy ranking beyond what `search3` returns.
- Searching within a single playlist, or filtering the browse grids in place.
- A dedicated "Search" tab (search is chrome above the tabs, not a fourth tab).
