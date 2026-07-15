import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCuePrompt, localCue } from '../server/cues';
import { requestCue } from '../src/lib/cues';
import { demoPack } from '../src/lib/evidence';

describe('mode-specific cue construction', () => {
  it('locks interview prompts to supplied facts', () => {
    const prompt = buildCuePrompt({ question: 'What clients have you worked for?', mode: 'Interview', instructions: '', evidence: [] });
    expect(prompt).toContain('Never invent experience, clients, figures, qualifications or history');
  });

  it('adds meeting challenge and action fields', () => {
    const cue = localCue({ question: 'Can we agree the next step?', mode: 'Meeting', instructions: '', evidence: demoPack.evidence.slice(0, 1) });
    expect(cue.challenge).toContain('assumption');
    expect(cue.action).toContain('owner');
  });
});

describe('unsupported claims', () => {
  it('shows the required interview fallback when evidence is absent', () => {
    const cue = localCue({ question: 'Have you led a £1bn acquisition?', mode: 'Interview', instructions: '', evidence: [] });
    expect(cue.grounded).toBe(false);
    expect(cue.bestEvidence).toBe('No grounded evidence found');
  });
});

describe('API error handling', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('surfaces a safe server error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Service temporarily unavailable.' }) }));
    await expect(requestCue('Can we proceed?', 'Meeting', '', demoPack)).rejects.toThrow('Service temporarily unavailable.');
  });
});
