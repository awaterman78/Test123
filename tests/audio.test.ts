import { describe, expect, it } from 'vitest';
import { resampleTo24k } from '../src/lib/audio';

describe('browser audio resampling', () => {
  it('downsamples the 48 kHz audio used by iPhone Safari to 24 kHz', () => {
    const input = Float32Array.from({ length: 480 }, (_, index) => index / 480);
    const output = resampleTo24k(input, 48_000);

    expect(output).toHaveLength(240);
    expect(output[0]).toBeCloseTo((input[0] + input[1]) / 2, 6);
    expect(output[239]).toBeCloseTo((input[478] + input[479]) / 2, 6);
  });

  it('copies audio that is already 24 kHz', () => {
    const input = new Float32Array([-.5, 0, .5]);
    const output = resampleTo24k(input, 24_000);

    expect([...output]).toEqual([...input]);
    expect(output).not.toBe(input);
  });
});
