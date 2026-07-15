export type RealtimeEvent =
  | { kind: 'status'; status: 'connecting' | 'listening' | 'disconnected' }
  | { kind: 'delta'; itemId: string; text: string }
  | { kind: 'completed'; itemId: string; text: string }
  | { kind: 'level'; value: number }
  | { kind: 'error'; text: string };

interface ActiveCapture {
  stream: MediaStream;
  peer: RTCPeerConnection;
  channel: RTCDataChannel;
  meterContext: AudioContext | null;
  meterTimer: number;
  commitTimer: number;
}

let active: ActiveCapture | null = null;

function messageToEvent(raw: string): RealtimeEvent | null {
  const event = JSON.parse(raw);
  if (event.type === 'conversation.item.input_audio_transcription.delta') {
    return { kind: 'delta', itemId: event.item_id, text: event.delta };
  }
  if (event.type === 'conversation.item.input_audio_transcription.completed') {
    return { kind: 'completed', itemId: event.item_id, text: event.transcript };
  }
  if (event.type === 'error') {
    return { kind: 'error', text: event.error?.message ?? 'Realtime transcription failed.' };
  }
  return null;
}

async function createMeter(stream: MediaStream, onEvent: (event: RealtimeEvent) => void) {
  try {
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    const source = context.createMediaStreamSource(stream);
    const mute = context.createGain();
    mute.gain.value = 0;
    source.connect(analyser);
    analyser.connect(mute);
    mute.connect(context.destination);
    await context.resume();
    const samples = new Float32Array(analyser.fftSize);
    const timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
      onEvent({ kind: 'level', value: Math.min(1, rms * 8) });
    }, 120);
    return { context, timer };
  } catch {
    return { context: null, timer: 0 };
  }
}

export async function startRoomCapture(onEvent: (event: RealtimeEvent) => void, token = '') {
  if (active) return;
  onEvent({ kind: 'status', status: 'connecting' });

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 },
    video: false
  });
  const track = stream.getAudioTracks()[0];
  if (!track) throw new Error('No microphone audio track was provided by the browser.');

  const peer = new RTCPeerConnection();
  const sender = peer.addTrack(track, stream);
  const channel = peer.createDataChannel('oai-events');
  const meter = await createMeter(stream, onEvent);

  const cleanupFailedStart = async () => {
    window.clearInterval(meter.timer);
    stream.getTracks().forEach(item => item.stop());
    peer.close();
    await meter.context?.close();
  };

  try {
    channel.addEventListener('message', message => {
      try {
        const event = messageToEvent(String(message.data));
        if (event) onEvent(event);
      } catch { onEvent({ kind: 'error', text: 'LiveCue received an unreadable transcription event.' }); }
    });

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    const response = await fetch('/api/realtime-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp', Authorization: `Bearer ${token}` },
      body: offer.sdp
    });
    const answer = await response.text();
    if (!response.ok) {
      let message = 'Could not start the mobile transcription connection.';
      try { message = JSON.parse(answer).error || message; } catch { /* Use the safe fallback. */ }
      throw new Error(message);
    }
    await peer.setRemoteDescription({ type: 'answer', sdp: answer });
    await new Promise<void>((resolve, reject) => {
      if (channel.readyState === 'open') return resolve();
      const timeout = window.setTimeout(() => reject(new Error('The mobile transcription connection timed out.')), 12_000);
      channel.addEventListener('open', () => { window.clearTimeout(timeout); resolve(); }, { once: true });
      channel.addEventListener('error', () => { window.clearTimeout(timeout); reject(new Error('The mobile transcription connection failed.')); }, { once: true });
    });
  } catch (error) {
    await cleanupFailedStart();
    throw error;
  }

  const commitTimer = window.setInterval(() => {
    if (channel.readyState === 'open' && track.readyState === 'live' && track.enabled) {
      channel.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
    }
  }, 2_500);

  active = { stream, peer, channel, meterContext: meter.context, meterTimer: meter.timer, commitTimer };
  const fail = (text: string) => {
    if (!active || active.peer !== peer) return;
    onEvent({ kind: 'error', text });
    onEvent({ kind: 'status', status: 'disconnected' });
    void stopRoomCapture();
  };
  track.addEventListener('ended', () => fail('Safari stopped the microphone. Press Start listening to reconnect.'));
  peer.addEventListener('connectionstatechange', () => {
    if (peer.connectionState === 'failed' || peer.connectionState === 'closed') fail('The live transcription connection ended. Press Start listening to reconnect.');
  });
  channel.addEventListener('close', () => fail('The live transcription channel ended. Press Start listening to reconnect.'));

  // Keep a reference to the sender: Safari starts transmitting as soon as the remote SDP is applied.
  void sender;
  onEvent({ kind: 'status', status: 'listening' });
}

export async function pauseRoomCapture() {
  active?.stream.getAudioTracks().forEach(track => { track.enabled = false; });
}

export async function resumeRoomCapture() {
  active?.stream.getAudioTracks().forEach(track => { track.enabled = true; });
}

export async function stopRoomCapture() {
  if (!active) return;
  const capture = active;
  active = null;
  window.clearInterval(capture.commitTimer);
  window.clearInterval(capture.meterTimer);
  capture.stream.getTracks().forEach(track => track.stop());
  capture.channel.close();
  capture.peer.close();
  await capture.meterContext?.close();
}

export function isRoomCaptureActive() { return Boolean(active); }
