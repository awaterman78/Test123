# LiveCue Web architecture

## Product boundary

This release is a browser-first vertical slice. One browser microphone captures the physical acoustic mix of the user and meeting audio played through a loudspeaker. Audio is never played by LiveCue and is not permanently recorded.

## Runtime components

### React browser application

The browser owns the interface, microphone permission, PCM conversion, document text extraction, evidence retrieval, rolling transcript and question detection.

The microphone is requested with echo cancellation and noise suppression disabled so laptop speaker audio is less likely to be removed. Audio is converted to mono 24 kHz PCM16 and sent in bounded Base64 chunks over a same-origin WebSocket.

DOCX, PDF, TXT and Markdown extraction occurs in the browser. Documents are transformed into evidence items that retain the original filename and extracted section. The original document bytes are not sent to the LiveCue server.

### Node server

The server has two narrow responsibilities:

1. Proxy bounded audio messages to a dedicated OpenAI Realtime transcription WebSocket.
2. Generate structured grounded cues through the Responses API.

The permanent OpenAI API key exists only in the server environment. No endpoint returns the key or accepts a key from the browser.

### Realtime transcription

The Node server opens the dedicated transcription intent endpoint. It sends a `session.update` whose session type is `transcription`. The transcription model is nested under `audio.input.transcription.model`. Server voice activity detection determines completed utterances.

The browser receives only connection status, transcript delta, completed utterance and safe error events.

### Question and cue pipeline

Completed utterances pass through deterministic detection and duplicate suppression. When a question qualifies, LiveCue waits 650 milliseconds before retrieving evidence and requesting a cue. The Responses API is not called for partial transcript fragments.

Interview prompts prohibit unsupported experience, clients, figures, qualifications and history. Empty interview evidence produces the deterministic `No grounded evidence found` state even when no API key is configured.

## Data lifecycle

| Data | Default location | Persistence |
| --- | --- | --- |
| Raw microphone audio | Browser memory and live WebSocket | None in LiveCue |
| Rolling transcript | Browser memory | Only by explicit download |
| Uploaded document bytes | Browser memory | None |
| Evidence pack | Browser memory | Only by explicit JSON download |
| OpenAI API key | Server environment | Host configuration only |

## Security controls

* No API key in Vite environment variables or browser assets.
* Private access-code gate for hosted deployments.
* Eight-hour signed browser sessions and rate-limited login attempts.
* Same-origin WebSocket endpoint with a narrow audio message contract.
* One megabyte maximum inbound audio message.
* One megabyte JSON request limit.
* Zod validation and evidence limits on cue requests.
* No server document upload endpoint.
* No audio recording path.
* Immediate track, AudioContext and socket release on full stop.

Before internet deployment, add normal production controls including authenticated sessions, origin validation, rate limiting, per-user quotas, structured audit events without transcript content, and a restrictive Content Security Policy.

## Next technical increment

The next quality upgrade should add an optional second browser capture path using explicit display or system audio sharing. That would preserve this simple room listening mode while allowing separate `Me` and `Other participants` labels when the browser and meeting source support it.
