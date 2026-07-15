import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('secure web boundaries', () => {
  it('keeps the permanent API key in the server only', () => {
    const client = fs.readFileSync('src/App.tsx', 'utf8') + fs.readFileSync('src/lib/audio.ts', 'utf8');
    expect(client).not.toContain('OPENAI_API_KEY');
    expect(client).not.toContain('sk-');
    expect(fs.readFileSync('.env.example', 'utf8')).toContain('OPENAI_API_KEY=');
  });

  it('uses a narrow audio-only browser message contract', () => {
    const server = fs.readFileSync('server/index.ts', 'utf8');
    expect(server).toContain("event.type === 'audio'");
    expect(server).toContain('event.audio.length < 1_000_000');
  });
});
