# Explore the Nón Lá — an interactive digital experience

An interactive website for children to explore the Vietnamese conical hat (nón lá) layer by layer:

1. **A Hat Full of Stories**: photos and short clips of the nón lá in everyday life.
2. **Uncover the Secrets of the Nón Lá**: a rotatable 3D hat (built in Blender) with stitches, leaves, the 16 bamboo rings and the chin strap revealed one layer at a time.
3. **Cultural Storytelling**: a three-chapter storybook (protection and care, handcraft heritage, cultural identity).
4. **Activity Hub**: Build Your Nón Lá, Colour Your Nón Lá, and the Nón Lá Memory Quiz.

Bilingual (English / Tiếng Việt) with narration for every on-screen text.

## Repository layout

| Path | What |
|---|---|
| `src/` | Web app (Vite + TypeScript) |
| `public/assets/` | Optimised, web-ready assets |
| `blender/` | Blender (bpy) scripts and `.blend` sources for the 3D hat and renders |
| `effectcraft/` | EffectCraft JSX scripts (video effects, Lottie motion graphics) |
| `photocraft/` | PhotoCraft action lists (slight photo edits) |
| `raw-assets/` | Unprocessed team files and PC-side outputs (photos, renders, edited video) |
| `ops/` | Coordination between the cloud build session and the PC session |

## For the team

**Live draft:** https://sussyswimmer.github.io/lang-digital-experience/ (it rebuilds on every push to `claude/funny-gates-g6ew58`; give it about 3 minutes).

Two things make reviewing quicker:

- **Language**: the EN / VI switch is in the top bar on every screen. The voice follows the switch.
- **Skip the first run**: the first visit plays Phases 1 → 4 in order, as the brief asks. After that, the Activity Hub (`…/#/play/hub`) opens everything. Add `?review=1` to the address to open any screen directly, e.g. `…/?review=1#/play/p3/identity`. The landing page shows first; tap **Continue**, which also switches the sound on.

### Changing words

Every word on screen lives in `content/strings/<area>.json` as `{ "en": …, "vi": …, "viStatus": … }`. The areas are `common`, `site`, `phase1`–`phase3`, `hub`, `build`, `colour`, `quiz`, `cert` and `gallery`. `npm run i18n:check` flags missing or empty strings.

- **Vietnamese review (Meri)**: `docs/vi-review.csv` lists all 521 strings, with the English beside the machine-drafted Vietnamese. Fill in `corrected_vietnamese` (and `comment` if needed) in Excel or Google Sheets and send it back. The corrections then go into the JSON with `viStatus: "reviewed"`. To regenerate the sheet after text changes, run `npm run i18n:export`.
- **Narration**: each narration line and spoken label has a recorded clip in both languages (`public/assets/audio/narration/{en,vi}/<id>.mp3`). If you change a line, re-record it. Until then the app keeps playing the old clip, and a brand-new line shows as a caption with no voice. `npm run tts:plan` lists the lines that are new or changed. Max records them with Higgsfield, and `npm run tts:ingest` installs the clips.

### Still open

| Who | What |
|---|---|
| Meri | Review the Vietnamese (`docs/vi-review.csv`). Also check how the English voice says Vietnamese words such as *nón lá* and *nón bài thơ*. |
| Team | Quiz questions 4 (how many rings: 16) and 5 (what hides in a nón bài thơ: poems) are drafts written to sit beside the brief's three. Keep, change or drop them. |
| Tram | Photo rights. `p2-chin-straps` carries a Dreamstime watermark, so it needs replacing or licensing. Permission is needed for `p3-identity` (© Doan Duc Minh), `p1-aodai` and `p3-poem`. Sources for the other photos are needed for the credits page. |
| Tram | The sound recordings weren't in the shared folder. The ambient sounds and effects are generated stand-ins for now, and any real recordings can replace them (`public/assets/audio/`). |

### Running it locally

```
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests
npm run test:e2e     # browser tests (Playwright)
```

How the app is put together, and how each asset is made (Blender, EffectCraft, PhotoCraft, Higgsfield), is covered in `docs/ARCHITECTURE.md`.
