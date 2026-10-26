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
