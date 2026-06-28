# PRD-05: Search the library

**Source:** Feature request — browsing is fine but there's no way to jump straight to a song,
album, or artist by name.
**Type:** Feature.

## Context

The Library tab lets you browse albums, artists, and playlists, but everything is by scroll.
With a real library that's slow. Subsonic exposes a single `search3` method that returns
matching artists, albums, and songs in one call — so search is cheap to add and needs no new
data plumbing beyond one client method.

Keep it lightweight: no new tab, no new persisted state, no fuzzy/local index. A search box
lives at the top of the existing **Library** tab. Typing runs a debounced server-side search
and replaces the content area with grouped results; clearing the box restores the normal
albums/artists/playlists subview.

## Scope

- A **search input** pinned at the top of the Library tab (above the segmented control).
- Debounced (~250 ms) server-side search via Subsonic `search3` as the user types; a query of
  fewer than 2 characters is ignored.
- Results render in the existing content area, grouped and labelled: **Songs**, **Albums**,
  **Artists** (each section only shown when it has hits).
  - **Songs** → a compact track list; clicking a song plays the result set from that song.
  - **Albums** → the existing album-grid renderer; clicking plays the album (reuses `playAlbum`).
  - **Artists** → the existing expandable artist row pattern (chevron → albums inline).
- Clearing the box (or empty/whitespace query) hides results and shows the current subview again.
- Standard loading / empty / error states, matching the rest of the tab.

## Proposed changes

- **`src/types.ts`** — add a `SearchResults` shape: `{ artists: Artist[]; albums: Album[]; tracks: Track[] }`.
- **`src/subsonic.ts`** — add `search(query, { songCount, albumCount, artistCount })` calling
  `search3`; map results through the existing `toTrack` / `toAlbum` mappers and the artist shape.
- **`src/tabs/library.ts`**
  - In `build()`, add a search `<input>` row above `.navidrome-subseg`; wire a debounced
    `input` handler.
  - Add `renderSearchResults(results)` that builds the grouped sections, reusing
    `renderAlbumGrid`, `playAlbum`, and the artist-expand logic (factor the artist-row builder
    out of `loadArtists` so both call it).
  - Add a small `renderTrackList(tracks)` helper (title + artist, click → `player.loadQueue`).
  - Track the active query so an empty box restores `showSubview(this.subview)`; guard against
    out-of-order responses (ignore a response whose query is no longer current).
- **`styles.css`** — styles for `.navidrome-search` (input), `.navidrome-results-section` /
  section headings, and `.navidrome-track-row`.

## Acceptance criteria

- [ ] A search box sits at the top of the Library tab.
- [ ] Typing ≥2 chars shows grouped Songs / Albums / Artists results from the server.
- [ ] Clicking a song plays it; clicking an album plays the album; an artist expands to its albums.
- [ ] Clearing the box restores the previous albums/artists/playlists view.
- [ ] Loading, empty ("No results"), and error states render like the rest of the tab.
- [ ] Rapid typing doesn't flash stale results (debounced + out-of-order guard).
- [ ] `npm run build` passes; no console errors.

## Out of scope

- A dedicated Search tab or global command-palette search.
- Searching playlists (Subsonic `search3` doesn't return them).
- Local/offline indexing, fuzzy matching, search history, or result paging ("show more").
