// Blender GLB → web GLB: dedup → prune (keep empties/attributes) → WebP textures → meshopt.
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
cli('webp', t(2), t(3), '--quality', '82');
cli('meshopt', t(3), t(4), '--level', 'medium');
copyFileSync(t(4), output);
const meta = input.replace(/\.glb$/, '.meta.json');
copyFileSync(meta, output.replace(/\.glb$/, '.meta.json'));
console.log(`${output}: ${(statSync(output).size / 1024).toFixed(0)} KB`);
