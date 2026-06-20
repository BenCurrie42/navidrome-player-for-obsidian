# 🎵 Navidrome Player for Obsidian

*Your music, spinning in the corner of your vault — so you never have to leave to hit skip.*

![Navidrome Player docked in the Obsidian sidebar, showing a spinning record for the current track](assets/screenshot.png)

---

I write in Obsidian for hours at a time, and I run my own [Navidrome](https://www.navidrome.org/)
server for my music. The problem was always the same: deep in a note, I'd want to skip a track
or change albums, and that meant leaving the window — a browser tab, a phone, a separate app —
and just like that, the focus was gone.

So I built the thing I wanted: a little player that lives in the Obsidian sidebar, plays my own
library at full quality, and **spins a record while it goes**. That spinning disc is the whole
soul of it. When the music plays, it turns. When you pause, it rests. It's the calendar plugin's
neighbor in the right dock, quietly keeping you company while you write.

This is a personal project, built for the way I work. If you self-host Navidrome and live in
your vault, I hope it makes your sessions a little better too.

> **Heads up:** desktop only for now. Mobile is on the wishlist once the audio path is proven there.

## What it does

- **🪩 A spinning record.** The current track's cover art turns like vinyl while audio plays and
  pauses its spin the moment you do. It's the signature surface, and it's genuinely lovely to
  glance at.
- **▶️ Real transport controls.** Play/pause, next, previous, a scrub bar, and volume — the basics,
  done right, in native Obsidian UI that respects your theme (light, dark, accent and all).
- **📚 Browse your whole library.** Albums in a cover-art grid, artists you can expand into their
  albums, and your server's playlists. Click anything to drop it into the queue and start playing.
- **🎚️ Full quality, no compromises.** Streams ask for original quality (`format=raw`,
  `maxBitRate=0`), so your server never transcodes down. mp3 and wav are the guaranteed floor;
  other codecs ride on whatever Obsidian's Chromium runtime can decode.
- **🔀 Shuffle & vibes.** Shuffle the current queue, or flip on **Random (vibes)** mode and let it
  pull songs from across your entire library, refilling the queue as it drains. Set it and drift.
- **💾 It remembers.** Your queue, position, playback mode, volume, and which tab you were on all
  come back when you restart Obsidian. Open the vault, and the music is right where you left it.
- **🔌 Two-minute setup.** Server URL, username, password in Obsidian's own settings, a
  **Test connection** button, and you're listening.

## Getting started

You'll need a running Navidrome server (or anything that speaks the Subsonic API) and the
desktop Obsidian app.

**Build it:**

```sh
npm install
npm run build
```

**Install it:**

1. Copy `main.js`, `manifest.json`, and `styles.css` into your vault at
   `<vault>/.obsidian/plugins/navidrome-player/`.
2. In Obsidian, open **Settings → Community plugins**, hit the reload icon, and toggle
   **Navidrome Player** on.
3. Open **Settings → Navidrome Player**, enter your server URL / username / password, and click
   **Test connection** — you're looking for a ✓.
4. Open the player from the **music icon** in the ribbon, or run **"Open Navidrome Player"** from
   the command palette. It docks in the right sidebar.

Then hit play and watch the record start to spin. 🎶

## Hacking on it

- `npm run dev` — esbuild in watch mode; rebuilds `main.js` as you save.
- `npm run build` — type-check (strict) and produce a production `main.js`.

The codebase is deliberately small and dependency-light: a thin typed Subsonic client
(`src/subsonic.ts`), one plain-TypeScript player/queue store (`src/player.ts`), and a single
sidebar view with two tabs (`src/view.ts`, `src/tabs/`). No UI framework — just `createEl` and a
CSS `@keyframes` for the spin. PRDs for upcoming work live in `plans/prds/`.

## Privacy & what lives on your machine

I built this for myself, so I care about it being honest about what it touches. Here's exactly
what it does on your computer — no surprises.

- **One file, one place.** Everything persisted lives in a single file managed by Obsidian:
  ```
  <vault>/.obsidian/plugins/navidrome-player/data.json
  ```
  Nothing is written anywhere else.
- **What's in that file:** your **settings** (server URL, username, password — stored locally, in
  plain text, in this vault only) and your **player state** (queue, position, mode, volume, active
  tab).
- **Cover art is cached in memory only**, for the current session. No image files hit your disk;
  art is simply re-fetched from your server after a restart.
- **It only talks to your server.** The one and only network destination is the Navidrome URL you
  configure. No analytics, no telemetry, no third parties — ever.
- **Your password stays yours.** Auth uses Subsonic token auth: each request sends your username,
  a fresh random salt, and `md5(password + salt)`. Your raw password is never sent over the wire.

## License

MIT — made with care, share it freely.
