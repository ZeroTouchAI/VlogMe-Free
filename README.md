# VlogMe Free

A free, browser-based AI vlog maker. Upload clips, get a script written by Gemini, narrate it with ElevenLabs, and render an MP4 with captions (.srt) - all in your browser tab.

**There are no server secrets.** Users bring their own Gemini and ElevenLabs keys. Keys stay in the browser (session only unless the user ticks "remember"). The site is static files, so the host holds no accounts, no database and no keys.

## How it works

1. Each clip is converted to a tiny low-res silent preview with ffmpeg.wasm (in the browser).
2. Previews go straight from the browser to Gemini, which picks the best moments and writes a script.
3. The user edits the script, then ElevenLabs voices each segment (browser -> ElevenLabs).
4. ffmpeg.wasm cuts each moment to match its narration, joins everything, and optionally mixes in the user's own music.

## Deploy on Vercel

1. Import this repo in Vercel. No framework preset needed, and **no environment variables**.
2. `vercel.json` already sets the build command, output folder (`public`) and a strict Content-Security-Policy.
3. Deploy.

The build copies ffmpeg.wasm from `node_modules` into `public/vendor` so it is served from your own domain.

## Referrals and links

Everything money- or owner-related is in [`public/referrals.js`](public/referrals.js): the ElevenLabs affiliate link, extra referral slots, the footer owner link, and a "More projects" list. Set `enabled: true` on a new entry and it appears. An affiliate disclosure is shown on the page.

## Limits (by design)

- Video only (no photos yet). About 12 clips / 800 MB total, because browsers cap memory.
- Rendering happens on the user's device, so long or 4K projects are slow. 720p output.
- Phone clips that use HEVC may need converting to H.264 first.
- Music: no tracks are bundled. Users upload their own (Pixabay link provided).

## Status

v0.1. Written without a browser test run: expect to debug the first deploy (ffmpeg.wasm loading, API CORS). See the console if a step fails.
