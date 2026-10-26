import { describe, expect, it } from 'vitest';
import strings from '../../content/strings/phase2.json';
import { SCRIPT, isLayer, nextChunk, prevChunk } from '../../src/phases/phase2/script';
import { LAYERS } from '../../src/app/types';

type Entry = { kind: string; en: string; vi: string; viStatus?: string };
const S = strings as Record<string, Entry>;

/** The brief's English, word for word (Phase 2). The chunks must add back up to exactly this. */
const BRIEF = {
  stitches: {
    question: 'What holds all these pieces tightly together?',
    insight:
      "Look closely! Can you see those tiny stitches? They may be small, but they have a very important job. They hold the leaves in place and help keep the hat together. Hat makers use thin, transparent white nylon thread to sew the delicate leaves onto the frame. The stitches must be neat and evenly spaced so the leaves stay secure and the hat looks beautiful. The sewing begins at the third rim from the wide brim and continues down towards the edge. But that's not all! The brim needs extra support, too. Red nylon thread and two thin bamboo wires help strengthen it, with a layer of tree bark tucked between the wires. Now you know the secret behind those tiny stitches: they help turn many separate pieces into one sturdy hat!",
  },
  leaves: {
    question: 'What keeps the rain off your face?',
    insight:
      "Here comes the leafy layer! These leaves help protect us from the sun and rain. But hat makers can't use just any leaves. They carefully choose leaves that are smooth, flat, and free from tears or cracks. First, the leaves need a little preparation. The hat maker gently irons them to make them flat and smooth. The heat must be just right. Too much heat can burn the leaves, while too little leaves them too soft. When prepared properly, the leaves become smooth, strong, and flexible. Next, it's time to cover the hat! The leaves are carefully arranged over a middle layer made from tree bark, called mo. The prettiest leaves are placed on the outside, where everyone can see them. The leaves are spread neatly across the frame, then secured with thread so they don't slip out of place. And here's one final touch! Once the hat is finished, the maker brushes on a protective coating of resin mixed with gasoline. This traditional finishing step helps the hat become shinier and more durable. And there you have it! Layer by layer, the leaves transform a simple frame into a hat that is both beautiful and useful.",
  },
  frame: {
    question: 'What gives the nón lá its conical shape?',
    insight:
      "Now, let's peek inside! What keeps the nón lá in its lovely cone shape? It's the frame hidden underneath the leaves! The frame is traditionally made from bamboo or wood. Thin bamboo strips are carefully split, shaved smooth, and shaped into circular rings. The rings are arranged from the largest at the bottom to the smallest at the top. Look how they get smaller and smaller until they reach the tip! These rings are joined to supporting ribs to create the hat's framework. Each ring must be placed carefully, with its joints staggered to help make the frame more stable. A traditional frame has 16 circular rings, with about 2 centimetres between neighbouring rings. The wide brim usually measures around 40 to 50 centimetres across. That's a lot of careful work! Every ring helps give the nón lá its familiar shape and supports the leaves that cover it. Without this hidden frame, the hat would not keep its beautiful cone shape!",
  },
  strap: {
    question: 'How does the hat stay securely on your head?',
    insight:
      "Our nón lá is almost complete! But wait a moment. What stops it from slipping off your head when the wind blows? Look underneath the hat. Can you spot the colourful strap? It's called the quai nón. This little strap helps keep the hat in place when you wear it. The hat maker carefully attaches the strap inside the hat using a large, curved needle and yarn. The strap is fastened on both sides, around the third, fourth, and fifth rings, counting upwards from the wide brim. Both sides must be attached carefully so the hat sits straight and feels balanced on your head. And look at those lovely colours! The strap may be purple, peach pink, or light green, adding a cheerful splash of colour to the hat. Now we have all the pieces: the frame gives the hat its shape, the leaves cover it, the stitches hold it together, and the chin strap helps keep it in place. Every little part has a job to do!",
  },
};

const sentences = (t: string) => t.match(/[^.!?]+[.!?]+/g)?.length ?? 0;

describe('Phase 2 script and strings', () => {
  it('uses the brief wording verbatim for every question and insight', () => {
    for (const l of LAYERS) {
      const s = SCRIPT[l];
      expect(S[s.question].en).toBe(BRIEF[l].question);
      expect(s.chunks.map((id) => S[id].en).join(' ')).toBe(BRIEF[l].insight);
    }
  });

  it('keeps each chunk short enough to cue a picture (1–3 sentences)', () => {
    for (const l of LAYERS) {
      for (const id of SCRIPT[l].chunks) {
        const n = sentences(S[id].en);
        expect(n, id).toBeGreaterThanOrEqual(1);
        expect(n, id).toBeLessThanOrEqual(3);
      }
    }
  });

  it('has a Vietnamese draft with diacritics for every string, marked for review', () => {
    for (const [id, e] of Object.entries(S)) {
      expect(id.startsWith('p2.'), id).toBe(true);
      expect(['ui', 'narration', 'label', 'alt']).toContain(e.kind);
      expect(e.vi.trim().length, id).toBeGreaterThan(0);
      expect(e.viStatus, id).toBe('machine');
    }
    const vi = Object.values(S).map((e) => e.vi).join(' ');
    expect(vi).toMatch(/[ăâđêôơưáàảãạếềểễệốồổỗộớờởỡợứừửữự]/);
  });

  it('points every layer at strings, a team photo and cues on real chunks', () => {
    for (const l of LAYERS) {
      const s = SCRIPT[l];
      for (const id of [s.name, s.question, s.photo.alt, ...s.chunks]) expect(S[id], id).toBeDefined();
      expect(s.photo.stem).toMatch(/^p2-/);
      for (const k of Object.keys(s.cues)) expect(Number(k)).toBeLessThan(s.chunks.length);
    }
    expect(SCRIPT.stitches.cues[2]).toBe('thirdRim'); // "The sewing begins at the third rim…"
    expect(SCRIPT.stitches.cues[3]).toBe('brim'); // red thread + bamboo wires
    expect(SCRIPT.strap.cues[3]).toBe('knots'); // "third, fourth, and fifth rings"
  });

  it('steps through chunks and recognises layer ids', () => {
    expect(nextChunk(0, 3)).toBe(1);
    expect(nextChunk(2, 3)).toBeNull();
    expect(prevChunk(0)).toBeNull();
    expect(prevChunk(2)).toBe(1);
    expect(isLayer('leaves')).toBe(true);
    expect(isLayer('hat')).toBe(false);
    expect(isLayer(undefined)).toBe(false);
  });
});
