# Architecture & contracts

The single reference for everyone (people and agents) building "Explore the Nón Lá".
Stack: **Vite 8 + TypeScript (no UI framework) + three.js 0.186 + GSAP 3.15 + Howler + lottie-web**.

```
npm run dev          # http://localhost:5173/lang-digital-experience/   (BASE_PATH=/ npm run dev for /)
npm run typecheck    # tsc --noEmit (must stay clean)
npm test             # vitest unit tests (tests/unit)
npm run build        # i18n:check + assets:check (warns) + typecheck + production build
npm run test:e2e     # Playwright (tests/e2e), Chromium in /opt/pw-browsers
```

Dev query flags: `?test=1` (on a `#/play…` link the app starts immediately; narration ×20 speed, idle hint after 0.5 s,
`window.__nonla` hooks), `?review=1` (every phase unlocked), `?no3d=1` (force the 2D layered-drawing fallback of the hat),
`?lineart=svg` (colouring pages from the hand-drawn SVGs instead of the Blender/Higgsfield PNGs), `?debug=1`.

---

## 1. Shell

| File | Role |
|---|---|
| `src/main.ts` | boot: fonts, CSS, settings store, landing page; Start → `App` |
| `src/app/App.ts` | stores, audio, narration, idle hints, routing, lazy screen loading (`SCREENS` map) |
| `src/app/flow.ts` | **pure** journey rules (P1 → P2 layers → P3 chapters → hub; open after first run) |
| `src/app/router.ts` | hash routes `#/play/p2/leaves` etc. |
| `src/app/context.ts` | `AppContext` and `Screen` interfaces (below) |
| `src/three/HatViewer.ts` | the shared WebGL hat API (`getViewer()`); implementation in `src/three/stage.ts` |

DOM layers inside `#app`: `#stage` (WebGL canvas, under everything), `#ui` (the current screen), `#captions`, `#hints`, `#toasts`.
`#stage` ignores pointer input unless it has class `interactive` (`viewer.setInteractive(true)`).

### Screen contract
```ts
export default function (): Screen   // each screen module's default export
interface Screen {
  mount(root: HTMLElement, ctx: AppContext, params: Record<string, string>): Promise<void> | void;
  update?(params): boolean;           // optional: handle p2/stitches → p2/leaves without remounting
  unmount(): void;                    // kill GSAP tweens, stop ambient audio, remove listeners/RAF
}
```
`root` is a full-screen `section.screen` with padding for the top bar (88 px) and captions (120 px).
Use `TopBar(ctx, { titleId })` from `src/ui/TopBar.ts` at the top of every play screen. Its title is the screen's focus
target: after each mount the shell focuses `[data-autofocus]` (the TopBar title, `tabindex=-1`) so keyboard and
screen-reader users land on the new screen. Home goes to the landing during the first run and from the hub (whose
Continue button comes back), and to the hub otherwise.

**Unmounted screens must be collectable.** Anything long-lived that still points at a screen keeps its whole DOM
(canvases included) alive for the rest of the visit. The shell drops the old screen's `i18n.bind`/`bindAttr` entries
(`i18n.prune()`) and resets the shared viewer's `sound` hook on every unmount; each screen removes what it added itself:
`i18n.onChange` and `store.subscribe` disposers, window/document listeners, timers, viewer controllers.

### AppContext (src/app/context.ts)
- `ctx.go(route)` · `ctx.completeP1()` · `ctx.completeLayer(layer)` · `ctx.completeChapter(chapter)` (mark progress *and* advance)
- `ctx.progress` / `ctx.settings` — `Store<T>` with `get()`, `set()`, `patch()`, `subscribe()`
- `ctx.narration.say(id)` → `Promise<'ended'|'stopped'>`; `queue(ids)`; `replay()`; `stop()`. Shows captions automatically.
  `preload(id)` fetches and decodes the next line while one plays (`queue()` does this itself), so a paragraph split
  into chunks has no gaps on slow Wi-Fi. The last few clips stay decoded, so Replay and the EN/VI switch are instant.
- `ctx.audio.sfx.play(id, { step })` — synthesised SFX ids: `tap snap peel ringSnap stitchTick floatBack chime badge pageTurn whoosh fillPop sparkle swish bookOpen invite leafRustle threadZip fanfare` (`step` raises the pitch of `stitchTick`/`ringSnap`)
- `ctx.audio.playAmbient(id)` / `stopAmbient(id?)` — `rain market breeze workshop school rainMarket` (file if present, else a synthesised bed).
  Running loops duck to ~30 % while narration speaks. `preloadAmbient(id)` (e.g. on a tile's `pointerdown`) starts loading the file early.
- `ctx.idle.watch({ stepId, gesture: 'tap'|'swipe'|'drag'|'trace', target: () => DOMRect|{x,y}, path?: () => {x,y}[], nudge? })`; `ctx.idle.clear(stepId)`. Shows the hand after 5 s of no input (brief requirement). **Every interactive step must register one.**
- `ctx.viewer()` → `Promise<HatViewer>` (lazy, shared)
- `ctx.toast(text)`; `ctx.flags.test` / `.review`

### Motion
`import { motion } from 'src/a11y/motion'` — `motion.reduced`, `motion.dur(seconds)`. Under reduced motion: no spins/bobbing, shorter tweens, fewer particles.

---

## 2. Text, narration and i18n

Every visible string lives in `content/strings/<area>.json` (one file per area, owned by that area):
```json
{ "p2.l1.question": { "kind": "narration", "en": "What holds all these pieces tightly together?", "vi": "…", "viStatus": "machine" } }
```
- `kind`: `ui` (buttons/labels), `narration` (spoken), `label` (3D/part labels), `alt` (image alt text, no audio).
- **English narration is the brief's wording, verbatim** (see the brief). Long insights are split into chunks of 2–3 sentences: `p2.l1.insight.1`, `.2`, … so each clip is 8–20 s and can trigger a visual cue.
- Vietnamese: natural, child-friendly drafts, `viStatus: "machine"` (Meri reviews later). Use proper diacritics.
- Ids are `dot.case`: `p1.*`, `p2.*`, `p3.*`, `hub.*`, `build.*`, `colour.*`, `gallery.*`, `quiz.*`, `cert.*`, `site.*`, `ui.*`, `a11y.*`.
  A segment after the first may be camelCase (`p2.ui.realPhoto`). Never rename an id: narration MP3s are named after it.
  `npm run i18n:check` (part of `npm run build`) validates the files and every literal id used in `src/`.
- In code: `i18n.t(id, vars?)`, and `i18n.bind(element, id)` to keep a node in sync with the EN/VI toggle. Never hard-code visible text.
  For attributes (`aria-label`, `alt`, `title`) use `i18n.bindAttr(element, attr, id, vars?)`: a one-off `i18n.t()` stays in
  the mount language, and screen readers then read English names with a Vietnamese voice.
- Narration audio is found by convention at `public/assets/audio/narration/{en,vi}/<id>.mp3` and listed in `content/audio-index.json`; until recorded, captions run on a reading-speed timer.
- Every button pairs an icon or picture with its text (pre-readers).

---

## 3. 3D contract (Blender → web)

Source: `blender/nonla_build.py` (Blender 5.2, procedural, deterministic). Web copy: `public/assets/models/nonla.glb` (meshopt + WebP; load with `GLTFLoader().setMeshoptDecoder(MeshoptDecoder)`) and `nonla.meta.json`.
Units metres; glTF **Y-up**; brim centre at the origin; **front of the hat faces +Z** (a camera at +Z sees the front).

```
nonla_root
└─ hat_assembly                       ← rotate/tilt/turn/shrink the whole hat here
   ├─ frame
   │  ├─ rings → ring_01 … ring_16    (01 = wide brim; each has child ring_joint_NN, the staggered overlap)
   │  └─ ribs  → rib_00 … rib_11
   ├─ leaf_inner                       (inner leaf shell)
   ├─ mo_bark                          (middle layer of bark, "mo")
   ├─ poem_art                         (hidden paper art, alpha texture)
   ├─ leaf_outer
   │  ├─ leaf_outer_panel_NN_hinge → leaf_outer_panel_NN   (12 panels × 2 leaves; NN = 00…11)
   │  └─ leaf_outer_cap               (covers rings 15–16 and the tip; remove last)
   ├─ stitches_white → stitch_white_row_02 … _16   (row 03 is where sewing starts = the trace row)
   ├─ brim → brim_wire_inner, brim_wire_outer, brim_bark, brim_thread_red
   ├─ strap_rig → strap, strap_knot_L, strap_knot_R, strap_yarn_L, strap_yarn_R  (tied at rings 3–5)
   ├─ apex_cap
   └─ anchors → anchor_strap_L, anchor_strap_R, anchor_hint_trace_start, anchor_label_brim
```
- One material per mesh. Names are `[a-z0-9_]` (safe through three.js name sanitising). `userData` (glTF extras) carries `layer`, `ring_index`, `panel_index`, `az_deg`, `count`, `sew_order`, …
- **Peel hinges**: each `leaf_outer_panel_NN_hinge` node's local axes are tangent **+X**, slant-to-brim **−Z**, outward **+Y**. Peel = rotate the hinge about its local +X (sign so the brim end lifts outward), optionally curl in a vertex shader.
- **Poem art** texture: Higgsfield paper-cut silhouettes baked onto the poem shell's UVs by `blender/poem_texture.py` (unrolled-cone warp, so they sit upright on the front of the hat).
- **Leaf textures**: Higgsfield palm-leaf scans upscaled to 4K, baked by `blender/leaf_textures.py` into a 4096×2048 outer-leaf atlas, an inner-leaf texture and normal maps (the procedural textures in `nonla_build.py` are the fallback).
- **Layer 3 → 4** (replaces integration correction 2): Layer 3 settles the rings back at their 2 cm spacing (its callout says so); Layer 4's "everything flies back" beat spreads them to 2.2× briefly before the shells return.
- **Narration asides**: a name the child taps during an explanation (thread chips, strap colours, 3D labels) goes through `narration.interject(id)`, which pauses the line, says the name and reads the line again; a language switch or Replay hands the waiting promise to the new take instead of stopping it.

### Viewer API (`src/three/HatViewer.ts`, built in `stage.ts`)
`getViewer(host)` lazily creates one shared viewer. Beyond the original contract it has: `kind` (`'3d'`, or `'2d'` for the
layered drawing used when WebGL can't start or with `?no3d=1`), `sound(id, opts)` (screens point it at `ctx.audio.sfx.play`),
`setFrame(rect | null)` (the screen area the hat should sit in, e.g. beside an open panel) and `debug()` (test hooks). A
`LayerController` may also offer `hint()` (where the 5-second hand should point), `assist()` ("show me" / keyboard) and
`cue(name)` (visual cues fired by insight chunks: `thirdRim`, `brim`, `joints`, …).
- Screens drawn over the hat must give their full-screen containers the class **`pass-through`** (pointer-events: none),
  or touches never reach the canvas; only real controls take pointer events.
- 3D labels are DOM nodes in an overlay inside `#stage`, positioned from `project(name)` each frame.
- With `?test=1` the viewer turns off GSAP lag smoothing and the hat's endless decorative loops so software WebGL keeps up.
- **Stitches**: each `stitch_white_row_NN` mesh has the vertex attribute `_stitch_t` (0…1 = which stitch along the row, k/(n−1)) for per-stitch glow (DataTexture lookup), plus `meta.stitch_rows[i].points/normals` (hat space) for screen-space tracing.
- **meta** keys: `params` (brim_d 0.48, height 0.21, ring_pitch 0.02, …), `rings[{name,index,s,r,y,joint_az_deg,joint_point}]`, `panels[{name,hinge,az_deg,len,hinge_point}]`, `stitch_rows[{name,ring,count,sew_order,points,normals}]`, `trace_rows`, `cascade_order` (`03, 02, RED_BRIM, 04…16`), `strap{anchor_L,anchor_R,rest_points[25],width,length,colors,attach_rings}`, `anchors`, `inside_out`, `build_order`.
- Strap colours: purple `#8E5BA8`, peach pink `#F4A79A`, light green `#A9D8A0`.

---

## 4. Assets

Everything served lives under `public/assets/` with stable names (a final asset replaces a placeholder by filename). Use `assetUrl(path)` / `picture(spec)` from `src/assets/manifest.ts`.

| Kind | Path |
|---|---|
| Photos | `img/photos/<stem>-<640|1280|1920>.<avif|webp|jpg>` (`diverse-4` and `p3-identity` also 2560). Sizes in `content/photos.json` |
| Model | `models/nonla.glb`, `models/nonla.meta.json` |
| Build-game layers | `img/layers/build-0{1..6}-{frame,leaf-inner,poem-art,leaf-outer,stitches,strap}.webp` (Blender renders, one locked camera; each is cut by the layers below it so they stack like the real hat) + `build-00-shadow.webp` (the whole hat's floor shadow, under the stack); the tray draws its pieces as SVG |
| Renders | `img/renders/{hat-full,cover,cover-hat}.webp` (`cover-hat` is trimmed to the hat, no floor: the storybook cover); the piece, underside and brim close-up stills only feed the quiz cards |
| Line art | `img/lineart/page-{1-plain,2-strap,3-poem,4-market}.png`: 1600×1200 (the studio's canvas size) black ink on transparent (paint goes underneath) + `page-*-600.webp` picker thumbnails. Pages 1–2 Blender Freestyle, 3–4 Higgsfield; hand-drawn `.svg` versions are the fallback |
| Quiz pictures | `img/quiz/<question>-<answer>.webp` (+ `-600`): Q2–Q4 Blender renders, Q1 from Blender stills, Q5 Higgsfield; `q1-scene`, `q3-scene` are Higgsfield illustrations |
| Illustrations | `img/art/*.webp`, UI art `img/ui/*` |
| Narration | `audio/narration/{en,vi}/<stringId>.mp3` |
| Ambient | `audio/ambient/{rain-on-hat,market-chatter,breeze-leaves,workshop,schoolyard,rain-market}.mp3` |
| Video loops | `video/p1-<tile>.{mp4,webm}` + `-poster.webp` |
| Scroll intro frames | `scroll/{960,1600}/f_0001.webp …` + `scroll/manifest.json` (`count`, `widths`, `aspect`, `bg`, `placeholder`, `bytes`) |
| Lottie | `lottie/{badge-pop,sparkle,tap-ripple}.json` (EffectCraft exports, played once by `src/ui/lottie.ts`: badge-pop when a quiz or Build badge lands, sparkle on a tapped earned badge or Phase 1 decoration, tap-ripple under the idle hand; nothing plays under reduced motion) |

Photo stems (team photos → PhotoCraft slight edit → encoded):

| Stem | Shows | Used for |
|---|---|---|
| `p1-farmers` | woman harvesting lotus in a pond | P1 tile "farmers in the fields" |
| `p1-market` | overhead: vendors among dragon fruit & mango | P1 tile "street vendors" |
| `p1-aodai` | schoolgirls in white áo dài | P1 tile "schoolgirls" |
| `p1-rain` | hat in the rain, purple raincoat | P1 tile "rain shower" |
| `diverse-3` | woman making hats by candlelight | P1 tile "craftspeople" |
| `p2-stitching` / `p2-layering-leaves` / `p2-16-rims` / `p2-chin-straps` | craft close-ups | P2 per-layer "real photo" insets |
| `p3-protection` | two farmers in a rice field (Ch1) | storybook chapter 1 |
| `p3-poem` | Tây Hồ poem hat on black (Ch2) | storybook chapter 2 |
| `p3-identity` | Quảng Trị market in the rain (Ch3) | storybook chapter 3 |
| `diverse-4` | hats against blue sky | landing hero, P1 decoration tile |
| `diverse-1`, `diverse-2` | jars; artisan & hat stacks | not used: kept in `raw-assets/photos/edited`, not published |

Asset pipeline: `npm run assets:photos | assets:glb | assets:renders | assets:video`, narration `npm run tts:plan` →
Higgsfield → `npm run tts:ingest` (only kinds `narration` and `label` are voiced: give any string the app says, card titles
included, kind `label`, not `ui`). `assets:photos` publishes only the stems in the table above.
`npm run assets:check` (also run by `npm run build`, as a warning) lists files under `public/assets` that nothing in `src/`,
`content/` or `index.html` refers to; delete them or move them to `raw-assets/`.

**If an asset you need doesn't exist yet**: draw a tasteful CSS/SVG placeholder in code (or reuse a photo) so the screen still works, and add an entry to `content/asset-requests.json` (`[{ "path", "what", "source": "blender|higgsfield|effectcraft|photocraft|tts", "notes" }]`). Don't block on assets.

---

## 5. Look & feel

Tokens in `src/styles/tokens.css` (straw, terracotta, forest, wood, dragon fruit, mango, leaf; fonts Fraunces for titles, Be Vietnam Pro for UI and body, Playpen Sans for captions and stickers, all with Vietnamese subsets; see `docs/DESIGN.md`).
Shared classes in `src/styles/components.css`: `.btn` (`--cta`, `--straw`, `--ghost`, `--round`), `.pulse`, `.bubble`, `.caption`, `.ph`.
Each area adds its own stylesheet next to its code (e.g. `src/phases/phase3/phase3.css`) and imports it from its screen module.
- Touch targets ≥ 64 px (`--tap-min`), primary CTAs 88 px. Mark them `data-touch`.
- Keep controls out of the bottom 120 px of `.screen` (the caption band). On phones (≤ 600 px) the caption shows only the
  sentence being spoken, so it stays inside that band.
- Text never sits directly on a photo: use a cream panel or a 60 % forest scrim.
- Tablet landscape first (1180×820), then desktop (1440×900), phone portrait fallback (390×844).

---

## 6. Testing hooks
With `?test=1`, `window.__nonla` exposes `state()`, `go(hash)`, `progress()`, `narrationLog()`, `sfxLog()`, `lang()`, `showHint()`.
Areas add their own hooks under `window.__nonla.<area>` (e.g. `p2.tracePath()`, `colour.pixel(x, y)`), only when `ctx.flags.test`.
Unit tests: `tests/unit/<area>.*.test.ts` (vitest, node env; `// @vitest-environment happy-dom` per file if DOM is needed).
E2E: `tests/e2e/<area>.spec.ts` (Playwright).

---

## 7. Ownership (parallel work)
Each area owns its folder, its `content/strings/<area>.json`, its CSS and its tests. Shared files (`src/app/*`, `src/ui/*`,
`src/audio/*`, `src/i18n/*`, `src/styles/*`, `package.json`) change only through the integrator. Don't add npm dependencies.
