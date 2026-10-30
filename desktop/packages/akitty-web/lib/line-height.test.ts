import { describe, expect, test } from 'vitest';
import { CanvasRenderer } from './renderer';

// The test canvas mock reports no bounding boxes, so a 15px font measures 12px ascent + 3px descent = 15px of glyph.
function metricsFor(lineHeight?: number) {
  const renderer = new CanvasRenderer(document.createElement('canvas'), { fontSize: 15, lineHeight });
  return renderer.getMetrics();
}

describe('lineHeight', () => {
  test('defaults to the glyph height plus padding', () => {
    expect(metricsFor()).toMatchObject({ height: 17, baseline: 13 });
  });

  test('adds leading split around the glyphs', () => {
    // 1.2 * 15px adds 3px: one above the baseline, two below
    expect(metricsFor(1.2)).toMatchObject({ height: 20, baseline: 14 });
  });

  test('never shrinks rows below the glyph height', () => {
    expect(metricsFor(0.5)).toMatchObject({ height: 17, baseline: 13 });
  });

  test('re-measures when the line height changes', () => {
    const renderer = new CanvasRenderer(document.createElement('canvas'), { fontSize: 15 });
    renderer.setLineHeight(1.2);
    expect(renderer.getMetrics().height).toBe(20);
  });
});
