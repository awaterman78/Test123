import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('mobile browser audio capture', () => {
  const client = fs.readFileSync('src/lib/audio.ts', 'utf8');

  it('uses self-contained in-memory MediaRecorder segments on Safari', () => {
    expect(client).toContain('new MediaRecorder(capture.stream');
    expect(client).toContain("fetch('/api/transcribe-segment'");
    expect(client).toContain('new Blob(chunks');
    expect(client).not.toContain('localStorage');
  });

  it('detects microphone failures and stops pending requests', () => {
    expect(client).toContain("track.addEventListener('ended'");
    expect(client).toContain("status: 'disconnected'");
    expect(client).toContain('track.enabled = false');
    expect(client).toContain('capture.controller.abort()');
  });
});
