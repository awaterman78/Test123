import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import express from 'express';
import OpenAI from 'openai';
import { WebSocket, WebSocketServer } from 'ws';
import { z } from 'zod';
import { buildCuePrompt, localCue } from './cues.js';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.disable('x-powered-by');

const requestSchema = z.object({
  question: z.string().min(3).max(4_000),
  mode: z.enum(['Interview', 'Meeting', 'Negotiation', 'Sales', 'General']),
  instructions: z.string().max(8_000),
  evidence: z.array(z.object({
    id: z.string(), type: z.string(), text: z.string().max(1_500), topics: z.array(z.string()).max(20),
    source: z.object({ document: z.string(), section: z.string().optional() })
  })).max(8)
});

const cueSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    question: { type: 'string' }, answerCues: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3 },
    bestEvidence: { type: 'string' }, evidenceSource: { type: 'string' }, bridge: { type: 'string' },
    followUp: { type: 'string' }, challenge: { type: 'string' }, action: { type: 'string' }, grounded: { type: 'boolean' }
  },
  required: ['question', 'answerCues', 'bestEvidence', 'evidenceSource', 'bridge', 'followUp', 'challenge', 'action', 'grounded']
};

app.get('/api/status', (_request, response) => response.json({ configured: Boolean(process.env.OPENAI_API_KEY) }));
app.get('/api/health', (_request, response) => response.json({ ok: true }));

app.post('/api/cues', async (request, response) => {
  try {
    const input = requestSchema.parse(request.body);
    if (!process.env.OPENAI_API_KEY) return response.json({ ...localCue(input), local: true });
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const result = await client.responses.create({
      model: process.env.OPENAI_CUE_MODEL || 'gpt-5.6',
      reasoning: { effort: 'none' },
      input: buildCuePrompt(input),
      text: { format: { type: 'json_schema', name: 'livecue_cue', strict: true, schema: cueSchema } }
    });
    response.json(JSON.parse(result.output_text));
  } catch (error) {
    const message = error instanceof z.ZodError ? 'The cue request was invalid.' : error instanceof Error ? error.message : 'Cue generation failed.';
    response.status(400).json({ error: message });
  }
});

const server = http.createServer(app);
const realtimeServer = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  if (request.url !== '/realtime') return socket.destroy();
  realtimeServer.handleUpgrade(request, socket, head, client => realtimeServer.emit('connection', client, request));
});

realtimeServer.on('connection', browser => {
  if (!process.env.OPENAI_API_KEY) {
    browser.send(JSON.stringify({ kind: 'error', text: 'The server has no OpenAI API key. Add it to .env and restart LiveCue.' }));
    return browser.close();
  }
  const safetyId = crypto.createHash('sha256').update('livecue-web').digest('hex');
  const upstream = new WebSocket('wss://api.openai.com/v1/realtime?intent=transcription', {
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'OpenAI-Safety-Identifier': safetyId }
  });
  upstream.on('open', () => {
    upstream.send(JSON.stringify({
      type: 'session.update',
      session: { type: 'transcription', audio: { input: {
        format: { type: 'audio/pcm', rate: 24_000 },
        transcription: { model: 'gpt-realtime-whisper', language: 'en', delay: 'low' },
        turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 700 }
      } } }
    }));
    if (browser.readyState === WebSocket.OPEN) browser.send(JSON.stringify({ kind: 'status', status: 'connected' }));
  });
  upstream.on('message', raw => {
    try {
      const event = JSON.parse(raw.toString());
      if (browser.readyState !== WebSocket.OPEN) return;
      if (event.type === 'conversation.item.input_audio_transcription.delta') browser.send(JSON.stringify({ kind: 'delta', itemId: event.item_id, text: event.delta }));
      if (event.type === 'conversation.item.input_audio_transcription.completed') browser.send(JSON.stringify({ kind: 'completed', itemId: event.item_id, text: event.transcript }));
      if (event.type === 'error') browser.send(JSON.stringify({ kind: 'error', text: event.error?.message ?? 'Realtime transcription failed.' }));
    } catch { /* Ignore malformed upstream events. */ }
  });
  upstream.on('error', error => browser.readyState === WebSocket.OPEN && browser.send(JSON.stringify({ kind: 'error', text: `Transcription connection failed: ${error.message}` })));
  upstream.on('close', () => browser.readyState === WebSocket.OPEN && browser.close());
  browser.on('message', raw => {
    try {
      const event = JSON.parse(raw.toString());
      if (event.type === 'audio' && typeof event.audio === 'string' && event.audio.length < 1_000_000 && upstream.readyState === WebSocket.OPEN) upstream.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: event.audio }));
      if (event.type === 'stop') upstream.close();
    } catch { /* Ignore malformed browser events. */ }
  });
  browser.on('close', () => upstream.close());
});

const currentFile = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(currentFile), '..');
app.use(express.static(path.join(projectRoot, 'dist')));
app.use((_request, response) => response.sendFile(path.join(projectRoot, 'dist', 'index.html')));

const port = Number(process.env.PORT || 8787);
server.listen(port, '0.0.0.0', () => console.log(`LiveCue web server listening on http://0.0.0.0:${port}`));
