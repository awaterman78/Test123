import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Realtime transcription configuration', () => {
  it('opens a transcription intent session and nests the transcription model', () => {
    const server = fs.readFileSync('server/index.ts', 'utf8');
    expect(server).toContain('wss://api.openai.com/v1/realtime?intent=transcription');
    expect(server).toContain("type: 'transcription'");
    expect(server).toContain("model: 'gpt-realtime-whisper'");
    expect(server).not.toContain('v1/realtime?model=');
  });
});
