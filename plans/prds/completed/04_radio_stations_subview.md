# PRD-04: Radio stations sub-tab under Library

**Source:** User request — "play my saved radios; it should be its own tab under Library."
**Type:** Feature.

## Context

The Library tab is a segmented control with three subviews — **Albums**, **Artists**,
**Playlists** (`src/tabs/library.ts`, the `navidrome-subseg` buttons). Navidrome stores the
user's saved internet radio stations and exposes them over the Subsonic API
(`getInternetRadioStations`). The user wants those stations browsable and playable from a new
**Radio** subview that sits alongside the existing three.

A radio station is **not** a library track: it has no track id to stream via `getStream`, no
duration, no album/queue semantics. It is a single live URL (`streamUrl`) that plays until
stopped. The plugin's player currently only knows how to play `Track`s by building
`client.streamUrl(track.id)` (`src/player.ts:109`), so radio needs a way to feed the `<audio>`
element a direct URL.

## Scope

- A **fourth subview button "Radio"** in the Library segmented control, after Playlists.
- Selecting it lists the user's saved stations (name, and a radio/antenna icon; homepage as a
  secondary line when present).
- Clicking a station starts playing it immediately and surfaces it in Now Playing.
- Reuses the existing loading / empty / error states and the refresh button.
- Live (unbounded) playback: no seek bar progress target, no auto-advance, no queue refill.

## Proposed changes

### Data model — `src/types.ts`
- Add a `RadioStation` interface: `{ id: string; name: string; streamUrl: string; homepageUrl?: string }`.
- Extend `Track` with two optional fields so the existing player/queue can carry a station
  without a parallel code path:
  - `streamUrl?: string` — when set, the player streams this URL directly instead of building
    one from `id`.
  - `isRadio?: boolean` — marks the entry as a live stream (disables auto-advance / refill /
    prefetch and lets the UI hide track-only chrome like the seek bar).

### Subsonic client — `src/subsonic.ts`
- Add `getRadioStations(): Promise<RadioStation[]>` calling `getInternetRadioStations`, reading
  `internetRadioStations.internetRadioStation[]` (`id`, `name`, `streamUrl`, `homepageUrl`),
  mapping to `RadioStation`. Follow the existing narrow `Raw*` + mapper pattern.

### Player — `src/player.ts`
- In `playCurrent()` (and `prefetchNext()` / `restore()`), when the current track has
  `streamUrl`, set `this.audio.src = track.streamUrl` directly instead of
  `client.streamUrl(track.id)`.
- Skip prefetch and `maybeRefill` for radio entries; in `handleEnded()`/`next()` do not
  auto-advance when `current.isRadio` (a live stream that ends is a dropout, not a track end —
  surface the existing playback-error path rather than skipping).
- Add a small helper, e.g. `playRadio(station: RadioStation)`, that loads a one-item queue built
  from the station (`{ id, title: name, streamUrl, isRadio: true, coverArt: undefined }`) — keeps
  the queue/Now-Playing wiring unchanged.

### Library tab — `src/tabs/library.ts`
- Add `"radio"` to `SubviewId`, the `loaded` map, and the `mk(...)` buttons (label "Radio").
- Route it in `showSubview()` to a new `loadRadio()` that mirrors `loadPlaylists()`: require
  client, show loading, `getRadioStations()`, render rows (`navidrome-radio-list` /
  `navidrome-radio-row`, `radio`/`antenna` icon via `setIcon`), empty state "No saved radio
  stations.", and on click call `this.player.playRadio(station)` with a `Notice`.

### Now Playing — `src/tabs/nowPlaying.ts`
- When `player.current?.isRadio`, hide/disable the seek bar and time readout (no meaningful
  duration), and show "LIVE" or the station name in place of album metadata. Transport: keep
  play/pause; next/prev are no-ops for radio (or hidden). Cover falls back to the existing
  no-art disc icon.

### Styles — `styles.css`
- Add `.navidrome-radio-list` / `.navidrome-radio-row` mirroring the playlist row styles, plus
  any "LIVE"/seek-hidden tweaks for the radio Now Playing state.

## Acceptance criteria
- [ ] Library shows a fourth subview button "Radio" after Playlists; it activates like the others.
- [ ] Radio subview lists the user's saved Navidrome stations (name + icon); empty state shows
      when there are none; errors and loading reuse the existing UI.
- [ ] Clicking a station starts playback within a couple seconds and shows it in Now Playing.
- [ ] Now Playing for a station hides the seek/progress UI and does not show a bogus duration;
      play/pause works; the queue does not auto-advance or refill off a station.
- [ ] Switching from a station back to an album/playlist plays normally (no leftover radio state).
- [ ] `npm run build` passes (strict); no console errors.

## Out of scope
- Adding / editing / deleting stations from the plugin (`createInternetRadioStation` etc.) —
  read-and-play only for now.
- Station logos/artwork, now-playing stream metadata (ICY title), and favorites/recents.
- Mobile (the plugin remains desktop-only).
