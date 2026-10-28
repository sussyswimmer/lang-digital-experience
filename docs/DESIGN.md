# Design direction: the hat-maker's table

The site works, but it looks like every other AI-built kids' app: cream gradient, white rounded
pills everywhere, soft drop shadows, one chunky rounded font, a centred card with a kicker pill
and a big CTA. Nothing on screen is made of what the hat is made of. This document is the brief
every screen follows from here on. It is the source of truth for look and feel; the rules in
`docs/ARCHITECTURE.md` (touch targets, narration, bilingual text, reduced motion) still hold.

## 1. What reads as "AI" today (audit, 28 Oct 2026)

| Tell | Where |
|---|---|
| Same recipe on every screen: cream gradient, white rounded panels, pill buttons, `--shadow-soft` | all |
| Baloo 2 + Nunito: the stock "friendly kids app" pairing; one weight, one size per role | all |
| Flat radial gradient behind the 3D hat; it floats in beige with no table, light or grain | P1, P2, P3 cover |
| Landing hero = centred card (kicker pill → H1 → tagline → pill CTA → icon chips) next to a vector window; "What's inside" = 4 numbered cards | landing |
| Hub cards: full-bleed colour label bars under glossy AI illustrations (same girl, same light) | hub |
| Accent colours spread evenly (terracotta / magenta / forest bars, mango buttons) so none of them matter | hub, colour, quiz |
| Faint diamond pattern on cream reads as a default "pattern fill" | app background |
| Decorative stickers (fruit, washi tape) are clean vector clip art | landing, P1 |

## 2. Direction

**Everything is made of the hat's own materials: rice paper, palm leaf, bamboo and red thread.**
A storybook laid out on a hat-maker's table. Warm, slightly imperfect, hand-sewn. Not a flat app.

- **Paper, not panels.** Surfaces are sheets of rice paper: warm off-white with visible fibre
  grain (SVG `feTurbulence` noise, multiplied at low opacity), slightly irregular corners
  (`border-radius: 22px 18px 24px 16px / 18px 24px 16px 22px`-style), a hairline deckle edge,
  and a two-layer paper shadow (tight 0 1px 2px + diffuse 0 12px 28px). Decorative sheets sit
  at ±0.4–1.2° rotation. Functional controls stay level.
- **Red thread is the signature line.** One accent does the work: `--thread` (#C8392B).
  Running stitches (`2px dashed`, 10/8 dash) under headings, around the active card, as the
  progress line, as an inset outline on the primary button. Stitches "sew in" with
  `stroke-dashoffset` on entrance. Nothing else is red.
- **Ink and leaf.** Text is deep forest ink (`--forest-900`) on paper. Palm-leaf straw
  (`--straw-*`) and bamboo (`--wood-*`) are the only other large colours. The market colours
  (dragon pink, mango, leaf green, sky) appear only as small stamps and stickers, never as
  whole bars or buttons.
- **A lit table under the 3D hat.** The stage gets a warm pool of light under the hat
  (radial, straw → paper), a soft vignette at the edges, and the same paper grain over the
  whole stage (`mix-blend-mode: multiply`, pointer-events none). The hat stands on something.
- **One entrance per screen.** Sheets settle onto the table (translateY 24px → 0, rotate
  from +1.5° to rest, 0.55 s, `--ease-out`, 60 ms stagger); the stitch line sews in after.
  No scattered micro-animations beyond the hand hint and the Lottie bursts.
- **Đông Hồ for pictures.** New illustrations are in the style of Đông Hồ folk woodblock
  prints: flat colour, bold black outline, limited palette (vermilion, indigo, ochre, leaf
  green, black) on rice paper, no gradients, no glossy light. This is the Vietnamese visual
  tradition the site is about, and it is the opposite of the glossy AI look.

## 3. Type

| Role | Face | Why |
|---|---|---|
| Display (titles, chapter names, questions) | **Fraunces** variable, `SOFT` 100 `WONK` 1, `opsz` auto | A soft, slightly wonky serif: storybook, warm, nothing like an app. Vietnamese subset. |
| UI and body | **Be Vietnam Pro** 400/600/700 | Designed for Vietnamese; clean humanist sans; the site is bilingual first. |
| Hand-written accent (captions, stickers, badge names, "Tranh của con") | **Playpen Sans** variable 500–700 | Made for children learning to write (single-storey a and g). Vietnamese subset. Used sparingly. |

Scale: display `clamp(2.4rem, 5.2vw, 4.6rem)`, line-height 0.98, letter-spacing −0.01em.
Section titles `clamp(1.6rem, 2.6vw, 2.4rem)`. Body 18–20 px, line-height 1.5. Buttons use the
UI face at 700, not the display face. Baloo 2 and Nunito are removed.

Tokens: `--font-display`, `--font-ui`, `--font-hand` (in `src/styles/tokens.css`). The old
`--font-head` / `--font-body` names stay as aliases for one release so no screen breaks.

## 4. Primitives (`src/styles/paper.css`)

- `.sheet` — rice-paper surface (grain, irregular corners, paper shadow). Modifiers:
  `.sheet--tilt-l`, `.sheet--tilt-r` (decorative rotation), `.sheet--tape` (a washi-tape
  strip at the top edge), `.sheet--flat` (no shadow, for inset areas).
- `.stitch` — a horizontal running stitch (`<hr class="stitch">` or `::after`), `.stitch--sew`
  animates in.
- `.stitched` — a dashed thread outline inset 5 px inside any element (`::before`).
- `.stamp` — a small round ink stamp for numbers and icons (market colours allowed here).
- `.tag` — a paper luggage tag with a punched hole and thread, for chips and labels.
- `.grain` — the SVG noise overlay (used by `.sheet` and the stage).
- `.btn` is restyled, not replaced: paper + stitched inset outline; `.btn--cta` is thread
  red with a cream stitched edge; `.btn--ghost` is plain paper.

## 5. Per-screen notes

- **Landing:** break the symmetry. Title set large top-left directly on the paper (no card),
  the shuttered window photo overlapping the title's right edge, Start as a red-thread
  stitched button, the three facts as paper tags pinned with tape, a hand-drawn arrow for the
  scroll cue. "What's inside" becomes four paper sheets at slight tilts with Đông Hồ stamps,
  not numbered cards. Parents & teachers: a folded green paper note, not a block.
- **Phase 1:** the collage is already paper photos with tape; make the tape and shadows
  match the primitives and put the explore button on a stitched sheet.
- **Phase 2:** the lit table under the hat; the question bubble and insight sheet become
  paper; the layer picker becomes four tags on a thread.
- **Phase 3:** the book cover keeps its forest cloth; pages are paper sheets with the
  stitched spine; prompts are hand-written on tags.
- **Phase 4 hub:** three paper sheets with Đông Hồ pictures and a stamped title; badges on a
  bamboo shelf; the certificate is a stitched sheet with a red stamp.
- **Build / Colour / Quiz:** tray pieces on paper tags, the workbench as real wood grain,
  quiz answers as tilted paper cards with the stitch marking the chosen one.

## 6. What does not change

Touch targets (64 px), narration for every string, EN/VI toggle, idle hand hints, reduced
motion, linear first run, the Blender model and renders, the recorded narration, the tests'
`data-test` hooks and the `window.__nonla` test API.
