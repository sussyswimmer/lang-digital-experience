// Build game: cut each Đông Hồ piece print out of its paper, so a dragged piece leaves its square behind.
//   img/art/piece-<stem>-800.webp  →  img/art/piece-<stem>-cut-800.webp (+ -cut-400), alpha, same 800×800 framing
// The prints are flat colour with a bold black outline on rice paper. The paper is whatever touches the
// edge of the print and still looks like paper (a flood fill on a slightly blurred copy, so the grain
// doesn't stop it); the bamboo frame's lattice also lets the paper show through its gaps, so for it every
// paper-coloured patch goes; the loop of red thread round the needle closes off a patch of paper that
// goes too, found from a seed point (the white thread on the spool is the same colour as the paper). The edge is softened from how far each outline pixel is from the paper colour,
// and those pixels are un-mixed from the paper so no beige fringe is left round the ink.
import sharp from 'sharp';

const DIR = 'public/assets/img/art';
const PIECES = {
  frame: { holes: true },
  'leaf-inner': {},
  'leaf-outer': {},
  'poem-art': {},
  stitches: { pockets: [[530, 460], [540, 420], [560, 570], [600, 560]] },
  'strap-green': {},
  'strap-peach': {},
  'strap-purple': {},
};
/** blurred colour distance below which a pixel is paper */
const PAPER_T = 34;
/** sharp colour distance over which an edge pixel is fully ink */
const INK_T = 90;
/** specks of fibre smaller than this (px) are paper too */
const SPECK = 80;

function median(values) {
  const s = Float64Array.from(values).sort();
  return s[s.length >> 1];
}

async function cut(stem, { holes = false, pockets = null }) {
  const src = `${DIR}/piece-${stem}-800.webp`;
  const { data: rgb, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const N = W * H;
  const { data: soft } = await sharp(src).removeAlpha().blur(1.6).raw().toBuffer({ resolveWithObject: true });

  // the paper colour: the median of a ring 12 px in from the edge
  const ring = [[], [], []];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (x > 12 && x < W - 13 && y > 12 && y < H - 13) continue;
      const i = (y * W + x) * 3;
      for (let c = 0; c < 3; c++) ring[c].push(soft[i + c]);
    }
  const paper = ring.map(median);
  const dist = (buf, p) => Math.hypot(buf[p * 3] - paper[0], buf[p * 3 + 1] - paper[1], buf[p * 3 + 2] - paper[2]);

  const isPaper = new Uint8Array(N);
  for (let p = 0; p < N; p++) isPaper[p] = dist(soft, p) < PAPER_T ? 1 : 0;

  // 0 = ink, 1 = paper
  const bg = new Uint8Array(N);
  const queue = new Int32Array(N);
  let head = 0;
  let tail = 0;
  const push = (p) => {
    if (bg[p] || !isPaper[p]) return;
    bg[p] = 1;
    queue[tail++] = p;
  };
  for (let x = 0; x < W; x++) push(x), push((H - 1) * W + x);
  for (let y = 0; y < H; y++) push(y * W), push(y * W + W - 1);
  while (head < tail) {
    const p = queue[head++];
    const x = p % W;
    if (x > 0) push(p - 1);
    if (x < W - 1) push(p + 1);
    if (p >= W) push(p - W);
    if (p < N - W) push(p + W);
  }
  if (holes) for (let p = 0; p < N; p++) if (isPaper[p]) bg[p] = 1;
  if (pockets) {
    // flood each enclosed patch of paper from its seed
    head = tail = 0;
    for (const [x, y] of pockets) {
      const p = y * W + x;
      if (!bg[p] && isPaper[p]) (bg[p] = 1), (queue[tail++] = p);
    }
    while (head < tail) {
      const p = queue[head++];
      const x = p % W;
      for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p >= W ? p - W : -1, p < N - W ? p + W : -1]) {
        if (q < 0 || bg[q] || !isPaper[q]) continue;
        bg[q] = 1;
        queue[tail++] = q;
      }
    }
  }

  // fibre specks left floating in the paper are paper
  const seen = new Uint8Array(N);
  for (let s = 0; s < N; s++) {
    if (bg[s] || seen[s]) continue;
    head = tail = 0;
    queue[tail++] = s;
    seen[s] = 1;
    while (head < tail) {
      const p = queue[head++];
      const x = p % W;
      for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p >= W ? p - W : -1, p < N - W ? p + W : -1]) {
        if (q < 0 || bg[q] || seen[q]) continue;
        seen[q] = 1;
        queue[tail++] = q;
      }
    }
    if (tail < SPECK) for (let k = 0; k < tail; k++) bg[queue[k]] = 1;
  }

  // the edge band: ink within 2 px of paper, paper within 1 px of ink
  const near = (p, want, r) => {
    const x0 = p % W;
    const y0 = (p / W) | 0;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = x0 + dx;
        const y = y0 + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (bg[y * W + x] === want) return true;
      }
    return false;
  };
  const alpha = new Float32Array(N);
  for (let p = 0; p < N; p++) {
    const band = bg[p] ? near(p, 0, 1) : near(p, 1, 2);
    if (!band) alpha[p] = bg[p] ? 0 : 1;
    else alpha[p] = Math.min(1, Math.max(0, (dist(rgb, p) - 10) / (INK_T - 10)));
  }

  const out = Buffer.alloc(N * 4);
  for (let p = 0; p < N; p++) {
    const a = alpha[p];
    for (let c = 0; c < 3; c++) {
      const v = rgb[p * 3 + c];
      // un-mix a half-covered pixel from the paper it was printed on
      out[p * 4 + c] = a > 0 && a < 1 ? Math.min(255, Math.max(0, Math.round((v - (1 - a) * paper[c]) / a))) : v;
    }
    out[p * 4 + 3] = Math.round(a * 255);
  }
  const img = sharp(out, { raw: { width: W, height: H, channels: 4 } });
  const png = await img.png().toBuffer();
  for (const w of [800, 400]) {
    await sharp(png)
      .resize({ width: w })
      .webp({ quality: 86, alphaQuality: 92, effort: 5 })
      .toFile(`${DIR}/piece-${stem}-cut-${w}.webp`);
  }
  console.log(`piece-${stem}-cut`, `paper rgb(${paper.map(Math.round).join(',')})`);
}

for (const [stem, opts] of Object.entries(PIECES)) await cut(stem, opts);
