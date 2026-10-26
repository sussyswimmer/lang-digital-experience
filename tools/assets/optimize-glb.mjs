// Blender GLB → web GLB: dedup → prune (keep empties/attributes) → WebP textures (colour, normals) → meshopt.
// Never flatten/join/instance/simplify: the app addresses every named node.
// Usage: node tools/assets/optimize-glb.mjs <in.glb> [out.glb]
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const input = process.argv[2] ?? 'blender/out/nonla.glb';
const output = process.argv[3] ?? 'public/assets/models/nonla.glb';
const dir = mkdtempSync(path.join(tmpdir(), 'glb-'));
const cli = (...args) => execFileSync('npx', ['gltf-transform', ...args], { stdio: 'inherit' });
const t = (n) => path.join(dir, `t${n}.glb`);

cli('dedup', input, t(1));
cli('prune', t(1), t(2), '--keep-leaves', 'true', '--keep-attributes', 'true');
// colour at q88 keeps the photographic leaf grain; normal maps need a little more (lossy WebP bends normals)
cli('webp', t(2), t(3), '--quality', '88', '--slots', 'baseColorTexture');
cli('webp', t(3), t(4), '--quality', '90', '--slots', 'normalTexture');
cli('meshopt', t(4), t(5), '--level', 'medium');
copyFileSync(t(5), output);
const meta = input.replace(/\.glb$/, '.meta.json');
copyFileSync(meta, output.replace(/\.glb$/, '.meta.json'));
console.log(`${output}: ${(statSync(output).size / 1024).toFixed(0)} KB`);
