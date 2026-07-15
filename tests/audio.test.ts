import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('mobile browser audio capture', () => {
  const client = fs.readFileSync('src/lib/audio.ts', 'utf8');

  it('uses native WebRTC rather than manually converting Safari PCM', () => {
    expect(client).toContain('new RTCPeerConnection()');
    expect(client).toContain('peer.addTrack(track, stream)');
    expect(client).toContain("fetch('/api/realtime-session'");
    expect(client).not.toContain('pcm16Base64');
  });

  it('detects real microphone and connection failures', () => {
    expect(client).toContain("track.addEventListener('ended'");
    expect(client).toContain("peer.addEventListener('connectionstatechange'");
    expect(client).toContain("status: 'disconnected'");
    expect(client).toContain('track.enabled = false');
  });
});
