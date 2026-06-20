# Navidrome Player

An Obsidian-native music player that docks in the right sidebar, connects to any
[Navidrome](https://www.navidrome.org/) server over the Subsonic API, and plays your
library at full quality — so you never have to leave your vault to control your music.

The signature surface is a spinning album cover for the current track. The view is split
into two tabs — **Now Playing** and **Library** — and playback continues no matter which
tab you're on or which note you're editing.

> Desktop only. Mobile is out of scope for this version.

## Features

- **Native settings** — server URL, username, and password live in a tab in Obsidian's own
  Settings panel, with a **Test connection** button.
- **Token auth** — the password derives a salted MD5 token per request; the raw password is
  never sent over the wire.
- **Now Playing** — spinning cover art (spins only while audio is actually playing),
  transport controls (play/pause, next, previous, seek, volume), track metadata, and the
  upcoming queue.
- **Library** — browse albums (grid with cover art), artists (expand to their albums), and
  the server's playlists. Click any album or playlist to load it into the queue and play.
- **Full quality** — streams request original quality (`format=raw`, `maxBitRate=0`), so the
  server does not transcode down. mp3 and wav are the guaranteed floor; other codecs play if
  Obsidian's Chromium runtime supports them.
- **Playback modes** — **Shuffle** the current queue, or **Random (vibes)** mode that pulls
  random songs from across your whole library and refills the queue as it drains.
- **Persistence** — the queue, playback position, playback mode, volume, and active tab are
  restored when you restart Obsidian (best effort).

## Installation (manual)

1. Build the plugin (or download a release):
   ```sh
   npm install
   npm run build
   ```
2. Copy `main.js`, `manifest.json`, and `styles.css` into your vault at:
   ```
   <vault>/.obsidian/plugins/navidrome-player/
   ```
3. In Obsidian, enable **Navidrome Player** under Settings → Community plugins.
4. Open Settings → **Navidrome Player**, enter your server URL / username / password, and
   click **Test connection**.
5. Open the player from the ribbon (music icon) or the command palette
   (**Open Navidrome Player**).

## Development

- `npm run dev` — esbuild in watch mode (rebuilds `main.js` on change).
- `npm run build` — type-check and produce a production `main.js`.

## Data, privacy & transparency

This plugin is deliberately transparent about what it writes to your machine and where.

- **One file, one place.** All persisted data lives in a single file managed by Obsidian's
  plugin-data API:
  ```
  <vault>/.obsidian/plugins/navidrome-player/data.json
  ```
  Nothing is written anywhere else on your computer.
- **What's in `data.json`:**
  - your **settings** — server URL, username, and password (stored locally, in plain text,
    in this vault only);
  - your **player state** — the current queue, the index/position within it, playback mode,
    volume, and which tab was last active.
- **Cover art is cached in memory only**, for the current session. No image files are written
  to disk. Cover art is re-fetched from your server after a restart.
- **Network.** The plugin talks **only** to the Navidrome server URL you configure. It makes
  no other network requests, sends no analytics, and contacts no third party.
- **Credentials over the wire.** Authentication uses Subsonic token auth: each request sends
  your username, a random salt, and `md5(password + salt)`. Your raw password is never
  transmitted.

## License

MIT
