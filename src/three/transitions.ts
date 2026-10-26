/**
 * The two big hand-offs: Phase 1 photos converging into the 3D hat, and the Phase 2 → 3
 * celebration (every piece home, chime, soft glow, exactly one full turn, then the hat shrinks
 * into the storybook cover's rect).
 */
import * as THREE from 'three';
import { motion } from '../a11y/motion';
import { HaloShell, Sparkles, clearGlow, setGlow, setOpacity } from './fx';
import { pad } from './hat';
import { DEFAULT_POSE, type Rig } from './rig';
import { DEFAULT_FRAMING, HAT_CENTRE_Y } from './scene';
import type { ScreenRect } from './HatViewer';

const UP = new THREE.Vector3(0, 1, 0);

export async function converge(rig: Rig, rects: ScreenRect[], images: string[]): Promise<void> {
  const stage = rig.stage;
  const anim = rig.anim.child();
  const reduced = motion.reduced;
  rig.resetAll();
  stage.setRect(null, 0);
  rig.rot.locked = true;
  const host = stage.overlay;
  const hostRect = stage.host.getBoundingClientRect();
  const centre = stage.toScreen(new THREE.Vector3(0, HAT_CENTRE_Y, 0));
  const cx = centre.x - hostRect.left;
  const cy = centre.y - hostRect.top;
  const tiles = rects.map((r, i) => {
    const img = document.createElement('img');
    img.src = images[i] ?? images[0] ?? '';
    img.alt = '';
    img.className = 'hat-converge-tile';
    Object.assign(img.style, { left: `${r.x - hostRect.left}px`, top: `${r.y - hostRect.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    host.appendChild(img);
    return { img, r };
  });
  const flash = document.createElement('div');
  flash.className = 'hat-converge-flash';
  Object.assign(flash.style, { left: `${cx}px`, top: `${cy}px` });
  host.appendChild(flash);
  rig.place.scale = 0.001;
  rig.applyTransforms();
  rig.sound('whoosh');
  const tl = anim.timeline();
  if (reduced) {
    tl.to(tiles.map((t) => t.img), { opacity: 0, duration: 0.5 }, 0);
    tl.to(rig.place, { scale: 1, duration: 0.5 }, 0.2);
  } else {
    tiles.forEach(({ img, r }, i) => {
      const dx = cx - (r.x - hostRect.left + r.width / 2);
      const dy = cy - (r.y - hostRect.top + r.height / 2);
      const swirl = (i % 2 ? 1 : -1) * 90;
      // x and y on different eases make a curved, spiralling path into the centre
      tl.to(img, { x: dx, duration: 1.1, ease: 'power3.in' }, i * 0.06);
      tl.to(img, { y: dy, duration: 1.1, ease: 'power2.in' }, i * 0.06);
      tl.to(img, { rotation: swirl * 0.1 + (i % 3) * 4, scale: 0.12, filter: 'sepia(0.7) saturate(1.3) brightness(1.15)', duration: 1.1, ease: 'power2.in' }, i * 0.06);
      tl.fromTo(img, { xPercent: 0 }, { xPercent: swirl * 0.25, duration: 0.55, yoyo: true, repeat: 1, ease: 'sine.inOut' }, i * 0.06);
    });
    tl.to(tiles.map((t) => t.img), { opacity: 0, duration: 0.15 }, 1.05);
    tl.fromTo(flash, { opacity: 0, scale: 0.3 }, { opacity: 0.95, scale: 1.4, duration: 0.25, ease: 'power2.out' }, 0.98);
    tl.to(flash, { opacity: 0, scale: 2.2, duration: 0.5, ease: 'power2.in' }, 1.23);
    tl.call(() => rig.sound('chime'), [], 1.0);
    tl.to(rig.place, { scale: 1, duration: 0.9, ease: 'back.out(1.6)' }, 1.0);
    tl.fromTo(rig.rot, { yaw: DEFAULT_POSE.yaw - Math.PI }, { yaw: DEFAULT_POSE.yaw, duration: 1.3, ease: 'power3.out' }, 1.0);
    tl.call(() => sparkle(rig, 60), [], 1.05);
  }
  await anim.done(tl);
  for (const t of tiles) t.img.remove();
  flash.remove();
  rig.place.scale = 1;
  rig.rot.yaw = DEFAULT_POSE.yaw;
  rig.rot.locked = false;
  rig.applyTransforms();
  stage.invalidate();
  anim.dispose();
}

export async function celebrateAndShrink(rig: Rig, rect: ScreenRect): Promise<void> {
  const stage = rig.stage;
  const hat = rig.hat;
  const anim = rig.anim.child();
  const reduced = motion.reduced;
  rig.rot.locked = true;
  rig.rot.stop();
  rig.labels.clear();

  // 1. every piece floats back into place
  const back = anim.timeline();
  let t = 0;
  for (let i = 1; i <= 16; i++) {
    const n = `ring_${pad(i)}`;
    if (hat.has(n)) back.to(hat.get(n).position, { y: hat.home(hat.get(n)).position.y, duration: 0.6 }, 0);
  }
  for (const n of ['leaf_inner', 'mo_bark', 'poem_art']) {
    if (!hat.has(n)) continue;
    const o = hat.get(n);
    if (o.userData.away || !o.visible) {
      rig.bringBack(o, anim, { dir: stage.cameraRight().negate().add(UP), dist: 0.5, delay: t, duration: 0.6 });
      t += 0.2;
    }
    setOpacity(hat.meshes(o), 1);
  }
  for (const p of rig.panels.panels) {
    if (p.state === 'on' && p.peel.value === 0) continue;
    const wasAway = p.state === 'away';
    p.state = 'on';
    if (wasAway) rig.bringBack(p.hinge, anim, { dir: p.radial.clone().add(UP), dist: 0.5, delay: t + 0.04 * p.index, duration: 0.6 });
    anim.to(p.peel, { value: 0, duration: 0.6, delay: t + 0.04 * p.index + 0.1, onUpdate: () => rig.panels.setPeel(p, p.peel.value, hat) });
  }
  for (const n of ['leaf_outer_cap', 'apex_cap']) {
    if (hat.has(n) && (hat.get(n).userData.away || !hat.get(n).visible)) rig.bringBack(hat.get(n), anim, { dist: 0.35, delay: t + 0.5, duration: 0.5 });
  }
  const stitches = rig.stitches;
  if (stitches.group.userData.away || !stitches.group.visible) {
    stitches.group.visible = true;
    stitches.group.userData.away = false;
    Object.assign(stitches.float, { f: 1.4, lift: 2 });
  }
  setOpacity(hat.meshes(stitches.group), 1);
  stitches.setAllGlow(0);
  anim.to(stitches.float, { f: 0, lift: 0, bob: 0, duration: 0.8, delay: t + 0.3, ease: 'power2.inOut' });
  const strapRig = hat.get('strap_rig');
  if (!strapRig.visible) {
    rig.strap.restShape();
    strapRig.visible = true;
  }
  rig.pose({ yaw: DEFAULT_POSE.yaw, pitch: 0.16, lift: 0 }, 1.0, anim);
  rig.frameTo({ ...DEFAULT_FRAMING, cy: HAT_CENTRE_Y - 0.03, halfH: DEFAULT_FRAMING.halfH + 0.06 }, 1.0);
  await wait(anim, Math.max(1.1, t + 1.2));

  // 2. a little "breath" outward and home: it's all one hat now
  if (!reduced) {
    for (const p of rig.panels.panels) {
      const home = hat.home(p.hinge).position;
      const out = home.clone().addScaledVector(p.radial, 0.02);
      anim.to(p.hinge.position, { x: out.x, z: out.z, duration: 0.45, yoyo: true, repeat: 1, ease: 'sine.inOut' });
    }
    anim.to(stitches.float, { lift: 0.8, duration: 0.45, yoyo: true, repeat: 1, ease: 'sine.inOut' });
  }

  // 3. chime, sparkles, a soft glow and exactly one full turn
  await wait(anim, reduced ? 0.1 : 0.5);
  rig.sound('chime');
  sparkle(rig, reduced ? 30 : 120);
  const glowMeshes = [...hat.meshes('leaf_outer'), ...(hat.has('apex_cap') ? hat.meshes('apex_cap') : [])];
  const halo = new HaloShell(glowMeshes, 0xffd27a, { width: 0.003, base: 0.15 });
  const g = { v: 0 };
  anim
    .timeline()
    .to(g, { v: 0.8, duration: 0.5, onUpdate: () => paint() })
    .to(g, { v: 0.3, duration: 1.4, onUpdate: () => paint() });
  function paint() {
    halo.intensity = g.v;
    setGlow(glowMeshes, 0xffc76a, g.v * 0.35);
  }
  const turn = anim.to(rig.rot, { yaw: rig.rot.yaw + Math.PI * 2, duration: reduced ? 1.2 : 2.4, ease: 'power2.inOut' });
  await anim.done(turn);

  // 4. shrink into the cover slot (the strap tucks away; a cover shows the hat itself)
  const strapMeshes = [rig.strap.ribbon, ...hat.meshes('strap_rig')];
  const s = { o: 1 };
  anim.to(s, { o: 0, duration: 0.5, onUpdate: () => setOpacity(strapMeshes, s.o), onComplete: () => (strapRig.visible = false) });
  anim.to(g, { v: 0, duration: 1.2, onUpdate: () => paint() });
  stage.framing.margin = DEFAULT_FRAMING.margin;
  rig.frameTo({ ...DEFAULT_FRAMING, cy: HAT_CENTRE_Y, halfW: 0.25, halfH: 0.16, margin: 1.0 }, 1.2);
  stage.setRect({ x: rect.x, y: rect.y, width: rect.width, height: rect.height }, reduced ? 0.4 : 1.2);
  await wait(anim, reduced ? 0.45 : 1.25);
  halo.dispose();
  clearGlow(glowMeshes);
  setOpacity(strapMeshes, 1);
  rig.rot.locked = false;
  anim.dispose();
  stage.invalidate();
}

function wait(anim: ReturnType<Rig['anim']['child']>, s: number): Promise<void> {
  return new Promise((resolve) => anim.call(s, resolve));
}

function sparkle(rig: Rig, count: number): void {
  const sp = new Sparkles(count, rig.world([0, HAT_CENTRE_Y + 0.02, 0]), 0.28, 18 * Math.min(window.devicePixelRatio || 1, 2));
  rig.stage.scene.add(sp.points);
  const off = rig.stage.onFrame((dt) => {
    if (sp.update(dt)) return true;
    sp.dispose();
    off();
    return false;
  });
}

