import { describe, expect, it } from 'vitest';
import { BEATS, activeBeat, beatTarget, stillFrame } from '../../src/site/storyBeats';
import site from '../../content/strings/site.json';

describe('story beats', () => {
  it('has four beats in order, without overlaps, ending at the end of the story', () => {
    expect(BEATS).toHaveLength(4);
    for (let i = 1; i < BEATS.length; i++) expect(BEATS[i].from).toBeGreaterThanOrEqual(BEATS[i - 1].to);
    expect(BEATS[BEATS.length - 1].to).toBeGreaterThan(1);
  });

  it('shows the right beat for a scroll position, and nothing between beats', () => {
    expect(activeBeat(0)).toBe(0);
    expect(activeBeat(0.1)).toBe(0);
    expect(activeBeat(0.27)).toBe(-1);
    expect(activeBeat(0.42)).toBe(1);
    expect(activeBeat(0.7)).toBe(2);
    expect(activeBeat(0.83)).toBe(-1);
    expect(activeBeat(0.95)).toBe(3);
    expect(activeBeat(1)).toBe(3);
    expect(activeBeat(1.4)).toBe(3);
    expect(activeBeat(-0.2)).toBe(0);
  });

  it('picks each beat\'s still inside its own beat', () => {
    for (let i = 0; i < BEATS.length; i++) expect(activeBeat(BEATS[i].still)).toBe(i);
    expect(stillFrame(0, 48)).toBe(2);
    expect(stillFrame(3, 48)).toBe(47);
    expect(stillFrame(3, 135)).toBe(134);
  });

  it('scrolls to a point inside each beat', () => {
    for (let i = 0; i < BEATS.length; i++) expect(activeBeat(beatTarget(i))).toBe(i);
    expect(beatTarget(3)).toBe(1);
  });

  it('uses the brief\'s caption wording, in both languages', () => {
    const s = site as Record<string, { kind: string; en: string; vi: string }>;
    expect(BEATS.map((b) => s[b.id].en)).toEqual(['A hat made of leaves…', '…shaped by 16 bamboo rings…', '…stitched by hand…', 'Ready to explore?']);
    for (const b of BEATS) {
      expect(s[b.id].kind).toBe('narration');
      expect(s[b.id].vi.length).toBeGreaterThan(5);
    }
  });
});
