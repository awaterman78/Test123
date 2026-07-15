export type RealtimeEvent =
  | { kind: 'status'; status: string }
  | { kind: 'delta'; itemId: string; text: string }
  | { kind: 'completed'; itemId: string; text: string }
  | { kind: 'error'; text: string };

interface ActiveCapture {
  stream: MediaStream;
  context: AudioContext;
  processor: ScriptProcessorNode;
  source: MediaStreamAudioSourceNode;
  socket: WebSocket;
}

let active: ActiveCapture | null = null;

function pcm16Base64(float32: Float32Array) {
  const buffer = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32.length; i++) {
    const sample = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 32_768) binary += String.fromCharCode(...bytes.subarray(i, i + 32_768));
  return btoa(binary);
}

export async function startRoomCapture(onEvent: (event: RealtimeEvent) => void) {
  if (active) return;
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 },
    video: false
  });
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${location.host}/realtime`);
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('The transcription connection timed out.')), 10_000);
    socket.addEventListener('open', () => { window.clearTimeout(timeout); resolve(); }, { once: true });
    socket.addEventListener('error', () => { window.clearTimeout(timeout); reject(new Error('Could not connect to the transcription service.')); }, { once: true });
  });
  socket.addEventListener('message', event => {
    try { onEvent(JSON.parse(String(event.data)) as RealtimeEvent); }
    catch { onEvent({ kind: 'error', text: 'LiveCue received an unreadable transcription event.' }); }
  });
  socket.addEventListener('close', () => onEvent({ kind: 'status', status: 'disconnected' }));

  const context = new AudioContext({ sampleRate: 24_000 });
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  const mute = context.createGain();
  mute.gain.value = 0;
  processor.onaudioprocess = event => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'audio', audio: pcm16Base64(event.inputBuffer.getChannelData(0)) }));
    }
  };
  source.connect(processor);
  processor.connect(mute);
  mute.connect(context.destination);
  active = { stream, context, processor, source, socket };
  onEvent({ kind: 'status', status: 'listening' });
}

export async function pauseRoomCapture() {
  await active?.context.suspend();
}

export async function resumeRoomCapture() {
  await active?.context.resume();
}

export async function stopRoomCapture() {
  if (!active) return;
  const capture = active;
  active = null;
  capture.processor.disconnect();
  capture.source.disconnect();
  capture.stream.getTracks().forEach(track => track.stop());
  if (capture.socket.readyState === WebSocket.OPEN) capture.socket.send(JSON.stringify({ type: 'stop' }));
  capture.socket.close();
  await capture.context.close();
}

export function isRoomCaptureActive() { return Boolean(active); }
