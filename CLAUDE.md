# VlogMe-Free - working rules

Public, browser-only sibling of the private VlogMe project. Never commit secrets, personal data, `.env` files, handoff notes, or anything under the private repo's never-copy list.

## Port rule

Whenever the private VlogMe repo changes, port anything non-sensitive and relevant to this repo in the same session (styles, prompts, wording, features that work in the browser). Note each port in `PORTING.md`. Skip anything that needs server-side secrets, Google Drive, Gmail, or GitHub Actions.

## Architecture

Static site in `public/`. All third-party calls (Gemini, ElevenLabs) go from the user's browser with the user's own keys. Keep the CSP in `vercel.json` in sync if a new host is added. All affiliate and owner links live in `public/referrals.js`.
