export type RealtimeEvent =
  | { kind: 'status'; status: string }
  | { kind: 'delta'; itemId: string; text: string }
  | { kind: 'completed'; itemId: string; text: string }
  | { kind: 'level'; value: number }
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

export function resampleTo24k(input: Float32Array, inputRate: number) {
  if (inputRate === 24_000) return new Float32Array(input);
  const ratio = inputRate / 24_000;
  const length = Math.max(1, Math.floor(input.length / ratio));
  const output = new Float32Array(length);
  if (ratio > 1) {
    for (let index = 0; index < length; index++) {
      const start = Math.floor(index * ratio);
      const end = Math.max(start + 1, Math.min(input.length, Math.floor((index + 1) * ratio)));
      let sum = 0;
      for (let source = start; source < end; source++) sum += input[source];
      output[index] = sum / (end - start);
    }
  } else {
    for (let index = 0; index < length; index++) {
      const position = index * ratio;
      const left = Math.floor(position);
      const right = Math.min(input.length - 1, left + 1);
      const mix = position - left;
      output[index] = input[left] * (1 - mix) + input[right] * mix;
    }
  }
  return output;
}

export async function startRoomCapture(onEvent: (event: RealtimeEvent) => void, token = '') {
  if (active) return;
  const context = new AudioContext();
  await context.resume();
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 },
      video: false
    });
  } catch (error) {
    await context.close();
    throw error;
  }
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${location.host}/realtime?token=${encodeURIComponent(token)}`);
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('The transcription connection timed out.')), 10_000);
      socket.addEventListener('open', () => { window.clearTimeout(timeout); resolve(); }, { once: true });
      socket.addEventListener('error', () => { window.clearTimeout(timeout); reject(new Error('Could not connect to the transcription service.')); }, { once: true });
    });
  } catch (error) {
    stream.getTracks().forEach(track => track.stop());
    socket.close();
    await context.close();
    throw error;
  }
  socket.addEventListener('message', event => {
    try { onEvent(JSON.parse(String(event.data)) as RealtimeEvent); }
    catch { onEvent({ kind: 'error', text: 'LiveCue received an unreadable transcription event.' }); }
  });
  socket.addEventListener('close', () => onEvent({ kind: 'status', status: 'disconnected' }));

  const source = context.createMediaStreamSource(stream);
  if (context.state === 'suspended') await context.resume();
  const processor = context.createScriptProcessor(4096, 1, 1);
  const mute = context.createGain();
  mute.gain.value = 0;
  let lastLevelAt = 0;
  let speechStartedAt = 0;
  let lastSpeechAt = 0;
  let preRoll: string[] = [];
  processor.onaudioprocess = event => {
    const audio = resampleTo24k(event.inputBuffer.getChannelData(0), event.inputBuffer.sampleRate);
    const now = performance.now();
    const rms = Math.sqrt(audio.reduce((sum, sample) => sum + sample * sample, 0) / audio.length);
    if (now - lastLevelAt > 120) {
      onEvent({ kind: 'level', value: Math.min(1, rms * 8) });
      lastLevelAt = now;
    }
    if (socket.readyState === WebSocket.OPEN) {
      const encoded = pcm16Base64(audio);
      if (rms > .008) {
        if (!speechStartedAt) {
          speechStartedAt = now;
          preRoll.forEach(chunk => socket.send(JSON.stringify({ type: 'audio', audio: chunk })));
          preRoll = [];
        }
        lastSpeechAt = now;
      }
      if (!speechStartedAt) {
        preRoll = [...preRoll.slice(-3), encoded];
        return;
      }
      socket.send(JSON.stringify({ type: 'audio', audio: encoded }));
      const finishedSpeaking = speechStartedAt && lastSpeechAt && now - lastSpeechAt > 700;
      const longUtterance = speechStartedAt && now - speechStartedAt > 12_000;
      if (finishedSpeaking || longUtterance) {
        socket.send(JSON.stringify({ type: 'commit' }));
        speechStartedAt = 0;
        lastSpeechAt = 0;
        preRoll = [];
      }
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
