export type RealtimeEvent =
  | { kind: 'status'; status: 'connecting' | 'listening' | 'disconnected' }
  | { kind: 'delta'; itemId: string; text: string }
  | { kind: 'completed'; itemId: string; text: string }
  | { kind: 'level'; value: number }
  | { kind: 'error'; text: string };

interface ActiveCapture {
  stream: MediaStream;
  recorder: MediaRecorder | null;
  meterContext: AudioContext | null;
  meterTimer: number;
  segmentTimer: number;
  controller: AbortController;
  uploadQueue: Promise<void>;
  token: string;
  onEvent: (event: RealtimeEvent) => void;
}

let active: ActiveCapture | null = null;

function preferredMimeType() {
  const choices = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
  return choices.find(type => MediaRecorder.isTypeSupported(type)) || '';
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

async function transcribeSegment(capture: ActiveCapture, blob: Blob) {
  if (blob.size < 1_000 || capture.controller.signal.aborted) return;
  const response = await fetch('/api/transcribe-segment', {
    method: 'POST',
    headers: { 'Content-Type': blob.type || 'application/octet-stream', Authorization: `Bearer ${capture.token}` },
    body: blob,
    signal: capture.controller.signal
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The microphone segment could not be transcribed.');
  const text = typeof result.text === 'string' ? result.text.trim() : '';
  if (text && active === capture) capture.onEvent({ kind: 'completed', itemId: `segment-${Date.now()}`, text });
}

function startSegment(capture: ActiveCapture) {
  if (active !== capture || capture.controller.signal.aborted) return;
  const chunks: Blob[] = [];
  const mimeType = preferredMimeType();
  const recorder = new MediaRecorder(capture.stream, mimeType ? { mimeType } : undefined);
  capture.recorder = recorder;
  recorder.addEventListener('dataavailable', event => { if (event.data.size) chunks.push(event.data); });
  recorder.addEventListener('error', () => {
    if (active !== capture) return;
    capture.onEvent({ kind: 'error', text: 'Safari could not read the microphone audio. Press Start listening to retry.' });
    capture.onEvent({ kind: 'status', status: 'disconnected' });
    void stopRoomCapture();
  });
  recorder.addEventListener('stop', () => {
    window.clearTimeout(capture.segmentTimer);
    if (active !== capture || capture.controller.signal.aborted) return;
    const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'application/octet-stream' });
    capture.uploadQueue = capture.uploadQueue
      .then(() => transcribeSegment(capture, blob))
      .catch(error => {
        if (capture.controller.signal.aborted || active !== capture) return;
        capture.onEvent({ kind: 'error', text: error instanceof Error ? error.message : 'Audio transcription failed.' });
      });
    startSegment(capture);
  });
  recorder.start();
  capture.segmentTimer = window.setTimeout(() => {
    if (recorder.state === 'recording') recorder.stop();
  }, 4_000);
}

export async function startRoomCapture(onEvent: (event: RealtimeEvent) => void, token = '') {
  if (active) return;
  if (typeof MediaRecorder === 'undefined') throw new Error('This browser does not support microphone transcription.');
  onEvent({ kind: 'status', status: 'connecting' });
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 },
    video: false
  });
  const track = stream.getAudioTracks()[0];
  if (!track) {
    stream.getTracks().forEach(item => item.stop());
    throw new Error('No microphone audio track was provided by the browser.');
  }
  const meter = await createMeter(stream, onEvent);
  const capture: ActiveCapture = {
    stream, recorder: null, meterContext: meter.context, meterTimer: meter.timer, segmentTimer: 0,
    controller: new AbortController(), uploadQueue: Promise.resolve(), token, onEvent
  };
  active = capture;
  track.addEventListener('ended', () => {
    if (active !== capture) return;
    onEvent({ kind: 'error', text: 'Safari stopped the microphone. Press Start listening to reconnect.' });
    onEvent({ kind: 'status', status: 'disconnected' });
    void stopRoomCapture();
  });
  try { startSegment(capture); }
  catch (error) { await stopRoomCapture(); throw error; }
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
  capture.controller.abort();
  window.clearTimeout(capture.segmentTimer);
  window.clearInterval(capture.meterTimer);
  if (capture.recorder?.state === 'recording') capture.recorder.stop();
  capture.stream.getTracks().forEach(track => track.stop());
  await capture.meterContext?.close();
}

export function isRoomCaptureActive() { return Boolean(active); }
