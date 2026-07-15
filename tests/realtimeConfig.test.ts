import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Realtime transcription configuration', () => {
  it('creates a WebRTC transcription session and nests the transcription model', () => {
    const server = fs.readFileSync('server/index.ts', 'utf8');
    expect(server).toContain("app.post('/api/realtime-session'");
    expect(server).toContain("https://api.openai.com/v1/realtime/calls");
    expect(server).toContain('wss://api.openai.com/v1/realtime?intent=transcription');
    expect(server).toContain("type: 'transcription'");
    expect(server).toContain("model: 'gpt-realtime-whisper'");
    expect(server).toContain('turn_detection: null');
    expect(server).toContain("type: 'input_audio_buffer.commit'");
    expect(server).not.toContain('v1/realtime?model=');
  });
});
