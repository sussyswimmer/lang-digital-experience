import { describe, expect, it } from 'vitest';
import strings from '../../content/strings/cert.json';
import { CERT_H, CERT_W, fitSize, formatDate, rowCentres, wrapLines } from '../../src/phases/phase4/quiz/certificate';

const S = strings as Record<string, { en: string; vi: string }>;
const mono = (s: string) => s.length * 10;

describe('certificate layout helpers', () => {
  it('is A4 landscape at about 300 dpi', () => {
    expect(CERT_W / CERT_H).toBeCloseTo(297 / 210, 2);
    expect(CERT_W).toBeGreaterThanOrEqual(2400);
  });

  it('wraps words to the width and keeps an over-long word whole', () => {
    expect(wrapLines(mono, 'for exploring every layer of the nón lá', 150)).toEqual(['for exploring', 'every layer of', 'the nón lá']);
    expect(wrapLines(mono, 'Supercalifragilistic hat', 100)).toEqual(['Supercalifragilistic', 'hat']);
    expect(wrapLines(mono, '', 100)).toEqual([]);
  });

  it('shrinks a long name until it fits, but not below the minimum', () => {
    const at = (text: string) => (size: number) => text.length * size * 0.5;
    expect(fitSize(at('Lan'), 1000, 150, 70)).toBe(150);
    const long = 'Nguyễn Thị Ánh Dương Bảo Ngọc';
    const s = fitSize(at(long), 1300, 150, 70);
    expect(s).toBeLessThan(150);
    expect(long.length * s * 0.5).toBeLessThanOrEqual(1300);
    expect(long.length * (s + 2) * 0.5).toBeGreaterThan(1300);
    expect(fitSize(at('x'.repeat(400)), 1000, 150, 70)).toBe(70);
  });

  it('centres a row of badges', () => {
    const xs = rowCentres(6, 1000, 160, 34);
    expect(xs).toHaveLength(6);
    expect((xs[0] + xs[5]) / 2).toBeCloseTo(1000);
    expect(xs[1] - xs[0]).toBe(194);
  });

  it('writes the date in the child’s language', () => {
    const d = new Date('2026-10-26T12:00:00Z');
    expect(formatDate(d, 'en')).toMatch(/26 October 2026/);
    expect(formatDate(d, 'vi')).toMatch(/26/);
    expect(formatDate(d, 'vi')).toMatch(/2026/);
  });

  it('has the bilingual title from the brief plan', () => {
    expect(S['cert.heading'].en).toBe('Nón Lá Explorer Certificate');
    expect(S['cert.heading'].vi).toBe('Giấy chứng nhận Nhà thám hiểm Nón Lá');
    for (let n = 0; n <= 5; n++) expect(S[`cert.earned.${n}`]?.vi).toBeTruthy();
  });
});
