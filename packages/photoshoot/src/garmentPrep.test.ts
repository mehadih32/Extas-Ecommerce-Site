// S24 · PR 447 — pure tests for garment-prep colour verification (no database).
import { describe, expect, it } from 'vitest';
import { colourDistance, colourDrift, hexToRgb } from './garmentPrep';

describe('hexToRgb', () => {
  it('parses with or without the leading #', () => {
    expect(hexToRgb('#1A2B3C')).toEqual({ r: 0x1a, g: 0x2b, b: 0x3c });
    expect(hexToRgb('1a2b3c')).toEqual({ r: 0x1a, g: 0x2b, b: 0x3c });
  });

  it('is null for anything that is not a 6-digit hex colour', () => {
    expect(hexToRgb('red')).toBeNull();
    expect(hexToRgb('#1A2')).toBeNull();
    expect(hexToRgb('#GGGGGG')).toBeNull();
    expect(hexToRgb('')).toBeNull();
  });
});

describe('colourDistance', () => {
  it('is 0 for the same colour', () => {
    expect(colourDistance({ r: 10, g: 20, b: 30 }, { r: 10, g: 20, b: 30 })).toBe(0);
  });

  it('is the full sRGB range for black vs white', () => {
    expect(colourDistance({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(441.67, 1);
  });

  it('is symmetric', () => {
    const a = { r: 10, g: 200, b: 30 };
    const b = { r: 240, g: 5, b: 180 };
    expect(colourDistance(a, b)).toBeCloseTo(colourDistance(b, a), 6);
  });
});

describe('colourDrift', () => {
  it('never flags with tolerance 0, however far the colours are (CN-018 off-by-default)', () => {
    expect(colourDrift('#000000', '#FFFFFF', 0).flagged).toBe(false);
  });

  it('flags only once the distance exceeds a positive tolerance', () => {
    expect(colourDrift('#000000', '#050505', 10).flagged).toBe(false); // distance ~8.7, under 10
    expect(colourDrift('#000000', '#141414', 10).flagged).toBe(true); // distance ~34.6, over 10
  });

  it('is not flagged at exactly the tolerance, flagged just past it', () => {
    // distance between #000000 and #0A0A0A is sqrt(3*10^2) ≈ 17.3
    const atBoundary = colourDrift('#000000', '#0A0A0A', 18);
    expect(atBoundary.flagged).toBe(false);
    const pastBoundary = colourDrift('#000000', '#0A0A0A', 17);
    expect(pastBoundary.flagged).toBe(true);
  });

  it('rejects anything that is not a 6-digit hex colour', () => {
    expect(() => colourDrift('not-a-colour', '#FFFFFF', 10)).toThrow(RangeError);
  });
});
