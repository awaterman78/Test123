# LiveCue Web

LiveCue Web is a silent real-time meeting copilot. This first browser version listens through one microphone to both the user and meeting audio playing from the laptop loudspeaker. It transcribes the mixed room audio, detects completed questions, retrieves relevant evidence and displays short grounded response cues.

It never speaks aloud and does not record audio.

## What works

* Premium responsive browser interface.
* Single microphone room and loudspeaker capture.
* Live partial and completed transcripts.
* Server voice activity detection.
* Automatic and manual question analysis.
* Duplicate question suppression.
* Low, Balanced and High sensitivity.
* Interview, Meeting, Negotiation, Sales and General modes.
* Local DOCX, PDF, TXT and Markdown text extraction in the browser.
* Reusable JSON evidence packs with source references.
* Grounded three-bullet answer cues.
* Explicit `No grounded evidence found` interview behaviour.
* Start, pause, resume and full stop controls.
* Explicit transcript and evidence pack downloads.
* Demo simulation without live audio or an API key.

## Important limitation of this first web version

The microphone receives one mixed stream. It hears the user, laptop loudspeaker and physical room together, so the transcript is labelled `Room audio`. It cannot yet distinguish `Me` from `Other participants` reliably. Headphones will prevent the microphone from hearing the meeting.

Place the laptop on a desk, use its speakers at a comfortable volume and avoid positioning the microphone directly beside a loudspeaker.

## Use as a hosted web app

LiveCue is designed to run at a normal HTTPS address. It is not a Windows application and has no installer or executable.

[![Deploy LiveCue to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/awaterman78/Test123)

The included `render.yaml` creates the complete Node web service, including WebSocket support, TLS and the private server environment. During the first deployment, Render prompts for `OPENAI_API_KEY` and `LIVECUE_ACCESS_CODE`. Choose a strong private access code that you will use to open LiveCue. Both values remain server secrets and are never built into the website.

For a temporary preview, the Free instance is sufficient. Render Free services can sleep after 15 minutes of inactivity, so the first visit after a quiet period can take around one minute to wake. A paid instance can be selected later if instant availability is required.

## Local development

Requirements for developers:

* Windows 10 or 11.
* Node.js 20 or later.
* Current Microsoft Edge or Google Chrome.
* An OpenAI API key for live transcription and AI cue generation.

Open a terminal in the project folder and run:

```bash
npm install
cp .env.example .env
npm run dev
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp`.

Set the key in `.env`:

```dotenv
OPENAI_API_KEY=your_key_here
LIVECUE_ACCESS_CODE=choose_a_private_access_code
OPENAI_CUE_MODEL=gpt-5.6
PORT=8787
```

Open [http://localhost:5173](http://localhost:5173) in Edge or Chrome.

1. Upload relevant documents or keep the clearly marked demo pack.
2. Choose the mode and update the instructions in Settings.
3. Keep meeting audio on the laptop loudspeaker.
4. Tick the consent confirmation.
5. Press `Start listening` and allow microphone access.

The permanent API key is read only by the Node server. It is never included in browser code, local storage, logs or built assets.

For a hosted deployment, LiveCue exchanges the private access code for an eight-hour signed browser session. The access code is not stored by the browser. Login attempts are rate limited.

## Commands

Development:

```powershell
npm run dev
```

Automated tests:

```powershell
npm test
```

Production build:

```powershell
npm run build
```

Run the production build:

```powershell
npm start
```

Then open [http://localhost:8787](http://localhost:8787).

## Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| Start or full stop | Ctrl + Shift + S |
| Analyse the current transcript | Ctrl + Enter |
| Dismiss the current cue | Escape |

## Deployment

This is not a static-only website. Deploy the built `dist`, `server-dist` and production dependencies to a Node host that supports persistent WebSocket upgrades. Configure `OPENAI_API_KEY` as a private server secret and terminate the public site with HTTPS. Microphone access is available on localhost during development but requires a secure HTTPS context in normal deployment.

Do not put `OPENAI_API_KEY` in any variable beginning `VITE_` because Vite exposes those variables to the browser bundle.

## Privacy and responsible use

LiveCue displays this warning before capture:

> Only use LiveCue where recording, transcription and AI assistance are permitted. You are responsible for obtaining any required consent.

Privacy behaviour:

* Audio is streamed for live transcription and is not written to disk by LiveCue.
* The rolling transcript remains in browser memory unless the user explicitly downloads it.
* Uploaded documents are extracted in the browser and reduced to an in-memory evidence pack.
* Evidence pack saving is an explicit download.
* Full stop immediately stops every microphone track, closes the audio context and closes the WebSocket.
* Closing or refreshing the page ends capture.

## Troubleshooting

### The meeting is not appearing in the transcript

Confirm that the meeting is playing through the laptop loudspeaker rather than headphones. Increase the speaker volume slightly, keep the laptop microphone unobstructed and select the correct microphone when the browser prompts.

### The browser removes the meeting voices

LiveCue requests microphone capture with echo cancellation and noise suppression disabled. Some hardware drivers can still apply processing. Try the laptop's built-in microphone, disable audio enhancements in Windows Sound settings, or move the laptop farther from external speakers.

### Microphone permission is blocked

Select the padlock beside the browser address, allow Microphone, reload the page and press Start again. On Windows, also check Settings, Privacy & security, Microphone and allow desktop apps to access it.

### OpenAI shows Standby

Create `.env`, add `OPENAI_API_KEY`, and restart both development processes. The application deliberately does not accept a permanent key through the browser.

### Simulation works but live audio does not

Simulation has a local deterministic fallback. Live transcription requires a valid server key and network access to the OpenAI Realtime API.

## OpenAI integration

The server opens `wss://api.openai.com/v1/realtime?intent=transcription`, creates a session with `type: transcription`, and sets `gpt-realtime-whisper` only at `audio.input.transcription.model`. This follows the current [Realtime transcription guide](https://developers.openai.com/api/docs/guides/realtime-transcription) and [Realtime WebSocket guide](https://developers.openai.com/api/docs/guides/realtime-websocket).

Cue generation uses the Responses API with strict structured output so the interface receives a predictable cue object.

## Test coverage

Normal test execution uses no live OpenAI calls. Tests cover:

* Direct and implied question detection.
* Sensitivity behaviour.
* Duplicate suppression.
* Evidence retrieval and unrelated evidence rejection.
* Unsupported interview claim handling.
* Meeting mode challenge and action construction.
* Cue API error handling.
* Transcript rolling retention.
* Server-only credential boundaries.
* Realtime transcription session configuration.
