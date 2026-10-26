# PhotoCraft slight edit

A *slight* edit only: gentle warmth, a touch of exposure, contrast and vibrance, softened
highlights / lifted shadows, and a light sharpen. No crops, filters or retouching. Layout crops
happen in the web build using focal points.

| Recipe | Used for |
|---|---|
| `nonla-slight.json` | every photo except the two below |
| `nonla-slight-nosharpen.json` | `p3-poem.jpg` (keeps the poem calligraphy untouched) |
| `nonla-slight-denoise.json` | `p2-chin-straps.jpg` (the source is a heavily compressed JPEG) |

Inputs: `raw-assets/photos/upscaled/` (Higgsfield 2K upscales of the team photos).
Outputs: `raw-assets/photos/edited/` (JPEG q92, same file names) + `manifest.json`.

Run on the PC (PowerShell, from the repo root): `powershell -ExecutionPolicy Bypass -File photocraft\run_slight_edit.ps1`
