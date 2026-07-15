import { describe, expect, it } from 'vitest';
import { DuplicateSuppressor, isQuestion } from '../src/lib/questionDetector';

describe('question detection', () => {
  it('detects a direct question', () => expect(isQuestion('How would you manage that commercial risk?')).toBe(true));
  it('detects an implied request in balanced mode', () => expect(isQuestion('Talk us through the rationale for that position', 'Balanced')).toBe(true));
  it('ignores ordinary conversation', () => expect(isQuestion('The mobilisation meeting took place yesterday.')).toBe(false));
  it('uses high sensitivity for challenges', () => expect(isQuestion("I'm not convinced that this solves the problem", 'High')).toBe(true));
});

describe('duplicate suppression', () => {
  it('suppresses near-identical questions inside the window', () => {
    const detector = new DuplicateSuppressor();
    expect(detector.isDuplicate('How would you handle a difficult stakeholder?', 1_000)).toBe(false);
    expect(detector.isDuplicate('How would you handle the difficult stakeholder?', 2_000)).toBe(true);
  });
});
