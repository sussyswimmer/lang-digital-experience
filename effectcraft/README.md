# EffectCraft scripts

Headless EffectCraft 0.17 (`effectcraft-cli script <file>.jsx`), After-Effects-style object model.
Each script builds its comps, saves an `.ecproj` under `raw-assets/video-edited/projects/`, and the
packet then renders with `effectcraft-cli render` (H.264 / WebM / PNG) and exports Lottie with
`effectcraft-cli exec file.exportLottie`.

| Script | Comps | Output |
|---|---|---|
| `intro_scroll.jsx` | `INTRO_SCROLL` (2560×1440, 30 fps, 270 f; effect sizes scale with the frame): the Blender explode/reassemble frames over a warm gradient with glow pulses on each "snap", a gold light sweep, sparse straw-dust particles, two soft light leaks, a flash at the explode peak, vignette, end fade to the page colour | `raw-assets/video-edited/scroll-intro-fx-1440p.mp4` (the earlier 1080p render stays as a fallback) → the web build extracts WebP frames for the scroll-scrubbed intro (no text baked in; grain is a CSS overlay) |
| `p1_loops.jsx` | `P1_RICE`, `P1_MARKET`, `P1_RAIN`, `P1_CRAFT`: the Higgsfield image-to-video clips with a warm grade (photo filter + vibrance) and a light vignette | `raw-assets/video-edited/p1-<name>-loop-{1080,540}.mp4` + `.webm` |
| `lottie_motion.jsx` | `BADGE_POP`, `SPARKLE`, `TAP_RIPPLE`: shape-layer motion graphics (Lottie keeps only shapes/transforms) | `raw-assets/lottie/*.json` |

Effect parameters are set through `setParam()`, which tries a few names and logs (never throws) when a
name differs in EffectCraft; `effectcraft-cli props <comp> <layer> --flat` lists the real paths.
