import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioLines, BookOpen, Check, ChevronRight, CircleStop, Download, FileText, Headphones,
  LoaderCircle, Mic, Pause, Pin, Play, Radio, RefreshCw, Save, Settings, ShieldCheck,
  Sparkles, Upload, Volume2, X, LockKeyhole
} from 'lucide-react';
import { pauseRoomCapture, resumeRoomCapture, startRoomCapture, stopRoomCapture, type RealtimeEvent } from './lib/audio';
import { buildEvidencePack, demoPack, extractFile } from './lib/evidence';
import { requestCue } from './lib/cues';
import { DuplicateSuppressor, isQuestion } from './lib/questionDetector';
import type { Cue, EvidencePack, Mode, Sensitivity, TranscriptItem } from './types';

const modes: Mode[] = ['Interview', 'Meeting', 'Negotiation', 'Sales', 'General'];
const duplicates = new DuplicateSuppressor();

function download(name: string, content: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [sessionName, setSessionName] = useState('Commercial leadership session');
  const [mode, setMode] = useState<Mode>('Meeting');
  const [sensitivity, setSensitivity] = useState<Sensitivity>('Balanced');
  const [instructions, setInstructions] = useState('Be direct, natural and commercially grounded. Keep cues short.');
  const [pack, setPack] = useState<EvidencePack>(demoPack);
  const [question, setQuestion] = useState('How would you handle a difficult stakeholder who disagrees with your commercial position?');
  const [cue, setCue] = useState<Cue | null>(null);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [listening, setListening] = useState(false);
  const [paused, setPaused] = useState(false);
  const [consent, setConsent] = useState(false);
  const [consentPromptOpen, setConsentPromptOpen] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [configured, setConfigured] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [sessionToken, setSessionToken] = useState(() => sessionStorage.getItem('livecue-session') || '');
  const [accessCode, setAccessCode] = useState('');
  const [authError, setAuthError] = useState('');
  const [authenticating, setAuthenticating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recent, setRecent] = useState<Cue[]>([]);
  const [pinned, setPinned] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [tab, setTab] = useState<'recent' | 'evidence' | 'actions'>('recent');
  const partials = useRef<Record<string, string>>({});
  const lastCompleted = useRef('');
  const analyseRef = useRef<(value?: string) => Promise<void>>(async () => {});

  useEffect(() => { fetch('/api/status').then(response => response.json()).then(data => { setConfigured(Boolean(data.configured)); setAuthRequired(Boolean(data.authRequired)); }).catch(() => setConfigured(false)); }, []);

  const analyse = useCallback(async (value = question) => {
    const clean = value.trim();
    if (!clean) return;
    setLoading(true); setError(''); setQuestion(clean);
    try {
      const next = await requestCue(clean, mode, instructions, pack, sessionToken);
      setCue(next);
      setRecent(items => [next, ...items.filter(item => item.question !== next.question)].slice(0, 12));
      if (next.action) setActions(items => [next.action!, ...items.filter(item => item !== next.action)].slice(0, 12));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Cue generation failed.'); }
    finally { setLoading(false); }
  }, [question, mode, instructions, pack, sessionToken]);

  useEffect(() => { analyseRef.current = analyse; }, [analyse]);

  const handleRealtime = useCallback((event: RealtimeEvent) => {
    if (event.kind === 'error') return setError(event.text);
    if (event.kind === 'status') {
      if (event.status === 'disconnected') {
        setListening(false); setPaused(false); setMicLevel(0);
      }
      return;
    }
    if (event.kind === 'level') return setMicLevel(event.value);
    if (event.kind === 'delta') {
      partials.current[event.itemId] = (partials.current[event.itemId] ?? '') + event.text;
      const item: TranscriptItem = { id: event.itemId, text: partials.current[event.itemId], partial: true, at: Date.now() };
      setTranscript(items => [...items.filter(existing => existing.id !== event.itemId), item].slice(-150));
    }
    if (event.kind === 'completed') {
      delete partials.current[event.itemId];
      const item: TranscriptItem = { id: event.itemId, text: event.text, partial: false, at: Date.now() };
      setTranscript(items => [...items.filter(existing => existing.id !== event.itemId), item].slice(-150));
      lastCompleted.current = event.text;
      setQuestion(event.text);
      if (isQuestion(event.text, sensitivity) && !duplicates.isDuplicate(event.text)) window.setTimeout(() => analyseRef.current(event.text), 650);
    }
  }, [sensitivity]);

  const beginCapture = useCallback(async () => {
    setError('');
    try { await startRoomCapture(handleRealtime, sessionToken); setListening(true); setPaused(false); }
    catch (cause) { await stopRoomCapture(); setError(cause instanceof Error ? cause.message : 'Microphone capture failed.'); }
  }, [handleRealtime, sessionToken]);

  const start = useCallback(async () => {
    if (!consent) { setConsentPromptOpen(true); return; }
    await beginCapture();
  }, [consent, beginCapture]);

  const stop = useCallback(async () => { await stopRoomCapture(); setListening(false); setPaused(false); setMicLevel(0); }, []);
  const togglePause = async () => { if (paused) { await resumeRoomCapture(); setPaused(false); } else { await pauseRoomCapture(); setPaused(true); } };

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 's') { event.preventDefault(); listening ? stop() : start(); }
      if (event.ctrlKey && event.key === 'Enter') { event.preventDefault(); analyseRef.current(lastCompleted.current || question); }
      if (event.key === 'Escape') setCue(null);
    };
    window.addEventListener('keydown', keys);
    return () => { window.removeEventListener('keydown', keys); void stopRoomCapture(); };
  }, [listening, question, start, stop]);

  const uploadDocuments = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true); setError('');
    try {
      const documents = await Promise.all([...files].map(async file => ({ name: file.name, text: await extractFile(file) })));
      setPack(buildEvidencePack(documents)); setCue(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Document extraction failed.'); }
    finally { setUploading(false); }
  };

  const saveTranscript = () => download(`LiveCue transcript ${new Date().toISOString().slice(0, 10)}.txt`, transcript.map(item => `[Room audio] ${item.text}`).join('\n\n'));

  const signIn = async () => {
    setAuthenticating(true); setAuthError('');
    try {
      const response = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: accessCode }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Sign in failed.');
      sessionStorage.setItem('livecue-session', body.token);
      setSessionToken(body.token); setAccessCode('');
    } catch (cause) { setAuthError(cause instanceof Error ? cause.message : 'Sign in failed.'); }
    finally { setAuthenticating(false); }
  };

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><AudioLines size={21} /></div><div><strong>LiveCue</strong><span>Silent meeting copilot · Web app</span></div></div>
      <label className="session-name"><span>SESSION</span><input value={sessionName} onChange={event => setSessionName(event.target.value)} /></label>
      <select className="mode-pill" value={mode} onChange={event => setMode(event.target.value as Mode)}>{modes.map(item => <option key={item}>{item}</option>)}</select>
      <Status icon={<Volume2 />} label="Room audio" active={listening && !paused} />
      <Status icon={<Radio />} label="OpenAI" active={configured} />
      <button className="icon-button" aria-label="Settings" onClick={() => setSettingsOpen(true)}><Settings /></button>
      {listening ? <><button className="secondary control" onClick={togglePause}>{paused ? <Play /> : <Pause />}{paused ? 'Resume' : 'Pause'}</button><button className="stop control" onClick={stop}><CircleStop />Full stop</button></> : <button className="start control" onClick={start}><Play />Start listening</button>}
    </header>

    <main className="workspace">
      <section className="pane transcript-pane">
        <PaneHeading eyebrow="LIVE TRANSCRIPT" title={listening ? paused ? 'Listening paused' : 'Listening to the room' : 'Ready when you are'} aside={<div className={`capture-badge ${listening && !paused ? 'live' : ''}`}><i />{listening && !paused ? 'CAPTURING' : 'OFF'}</div>} />
        {error && <div className="error-banner transcript-error"><X onClick={() => setError('')} /><span>{error}</span></div>}
        <div className="source-notice"><Headphones /><div className="source-copy"><strong>Speaker listening mode</strong><span>LiveCue hears your voice and laptop loudspeaker together through one microphone.</span></div>{listening && <div className="mic-signal" aria-label={micLevel > .025 ? 'Microphone is hearing audio' : 'Microphone is connected'}>{[.55, .8, 1, .72, .48].map((weight, index) => <i key={index} style={{ transform: `scaleY(${Math.max(.12, Math.min(1, micLevel * 3.2 * weight + .12))})` }} />)}<small>{micLevel > .025 ? 'Hearing audio' : 'Mic connected'}</small></div>}</div>
        <div className="transcript-list">
          {transcript.length ? transcript.map(item => <article className="utterance" key={item.id}><div className="avatar">RM</div><div><div className="speaker">Room audio <time>{new Date(item.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div><p>{item.text}{item.partial && <span className="cursor" />}</p></div></article>) : <div className="empty-state"><div className="listening-orb"><Mic /></div><h3>Your conversation will appear here</h3><p>Place the meeting through the laptop speakers. LiveCue will listen through the selected microphone without recording the audio.</p><div className="audio-route"><Volume2 /><span>Laptop loudspeaker</span><ChevronRight /><Mic /><span>Microphone</span><ChevronRight /><Sparkles /><span>LiveCue</span></div></div>}
        </div>
        <div className="privacy-strip"><ShieldCheck /><div><strong>Private by default</strong><span>No audio recording and no automatic transcript saving.</span></div><button onClick={saveTranscript} disabled={!transcript.length}><Save />Save transcript</button></div>
      </section>

      <section className="pane cue-pane">
        <PaneHeading eyebrow="CURRENT PROMPT" title={loading ? 'Building grounded cues…' : cue ? 'Response ready' : 'Simulation mode'} aside={<span className="silent-pill">SILENT ONLY</span>} />
        {cue ? <CuePanel cue={cue} dismiss={() => setCue(null)} regenerate={() => analyse(cue.question)} pin={() => setPinned(items => [cue.bestEvidence, ...items.filter(item => item !== cue.bestEvidence)])} loading={loading} /> : <Simulation question={question} setQuestion={setQuestion} analyse={() => analyse()} loading={loading} pack={pack} />}
        <EvidenceCard pack={pack} uploading={uploading} upload={uploadDocuments} />
      </section>
    </main>

    <footer className="bottom-panel">
      <nav><button className={tab === 'recent' ? 'active' : ''} onClick={() => setTab('recent')}>Recent questions <b>{recent.length}</b></button><button className={tab === 'evidence' ? 'active' : ''} onClick={() => setTab('evidence')}>Pinned evidence <b>{pinned.length}</b></button><button className={tab === 'actions' ? 'active' : ''} onClick={() => setTab('actions')}>Actions captured <b>{actions.length}</b></button></nav>
      <div className="bottom-content">
        {tab === 'recent' && recent.slice(0, 4).map(item => <button key={item.question} onClick={() => setCue(item)}><span>{item.question}</span><ChevronRight /></button>)}
        {tab === 'evidence' && pinned.map(item => <p key={item}><Pin />{item}</p>)}
        {tab === 'actions' && actions.map(item => <p key={item}><Check />{item}</p>)}
        {((tab === 'recent' && !recent.length) || (tab === 'evidence' && !pinned.length) || (tab === 'actions' && !actions.length)) && <span className="nothing">Nothing captured yet.</span>}
      </div>
    </footer>

    <div className="consent-bar"><label><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /><span>Only use LiveCue where recording, transcription and AI assistance are permitted. You are responsible for obtaining any required consent.</span></label></div>

    {consentPromptOpen && <div className="modal-backdrop"><div className="modal consent-modal"><div className="modal-icon"><ShieldCheck /></div><span className="eyebrow">CONSENT REQUIRED</span><h2>Before LiveCue listens</h2><p>Only use LiveCue where recording, transcription and AI assistance are permitted. You are responsible for obtaining any required consent.</p><button className="start wide" onClick={() => { setConsent(true); setConsentPromptOpen(false); void beginCapture(); }}><Mic />I understand, start listening</button><button className="secondary wide consent-cancel" onClick={() => setConsentPromptOpen(false)}>Cancel</button></div></div>}
    {settingsOpen && <div className="modal-backdrop"><div className="modal"><button className="modal-close" onClick={() => setSettingsOpen(false)}><X /></button><div className="modal-icon"><Settings /></div><span className="eyebrow">SESSION SETTINGS</span><h2>How should LiveCue support you?</h2><label>Mode<select value={mode} onChange={event => setMode(event.target.value as Mode)}>{modes.map(item => <option key={item}>{item}</option>)}</select></label><label>Question sensitivity<select value={sensitivity} onChange={event => setSensitivity(event.target.value as Sensitivity)}><option>Low</option><option>Balanced</option><option>High</option></select></label><label>Role, objectives and speaking style<textarea value={instructions} onChange={event => setInstructions(event.target.value)} /></label><div className="shortcut-list"><span><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>S</kbd> Start or stop</span><span><kbd>Ctrl</kbd><kbd>Enter</kbd> Analyse current transcript</span><span><kbd>Esc</kbd> Dismiss prompt</span></div><button className="start wide" onClick={() => setSettingsOpen(false)}>Save settings</button></div></div>}
    {authRequired && !sessionToken && <div className="modal-backdrop auth-backdrop"><form className="modal auth-modal" onSubmit={event => { event.preventDefault(); void signIn(); }}><div className="modal-icon"><LockKeyhole /></div><span className="eyebrow">PRIVATE WEB APP</span><h2>Welcome to LiveCue</h2><p>Enter your private access code to open the meeting copilot.</p><label>Access code<input autoFocus type="password" value={accessCode} onChange={event => setAccessCode(event.target.value)} autoComplete="current-password" /></label>{authError && <div className="error-banner auth-error"><span>{authError}</span></div>}<button className="start wide" disabled={!accessCode || authenticating}>{authenticating ? <LoaderCircle className="spin" /> : <LockKeyhole />}Open LiveCue</button><small>Your access code is exchanged for a temporary browser session and is not stored in the app.</small></form></div>}
  </div>;
}

function PaneHeading({ eyebrow, title, aside }: { eyebrow: string; title: string; aside: React.ReactNode }) {
  return <div className="pane-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>{aside}</div>;
}

function Status({ icon, label, active }: { icon: React.ReactNode; label: string; active: boolean }) {
  return <div className="status">{icon}<span>{label}<b className={active ? 'on' : ''}>{active ? 'Connected' : 'Standby'}</b></span></div>;
}

function Simulation({ question, setQuestion, analyse, loading, pack }: { question: string; setQuestion: (value: string) => void; analyse: () => void; loading: boolean; pack: EvidencePack }) {
  return <div className="simulation-card"><div className="test-badge"><Sparkles />TEST WITHOUT LIVE AUDIO</div><h3>Ask LiveCue a realistic question</h3><p>It will detect the intent, retrieve relevant evidence and build short grounded cues.</p><textarea value={question} onChange={event => setQuestion(event.target.value)} /><div className="simulation-actions"><span><BookOpen />{pack.name}</span><button className="start" disabled={loading || !question.trim()} onClick={analyse}>{loading ? <LoaderCircle className="spin" /> : <Sparkles />}Generate cues</button></div></div>;
}

function EvidenceCard({ pack, uploading, upload }: { pack: EvidencePack; uploading: boolean; upload: (files: FileList | null) => void }) {
  return <div className="evidence-pack"><div className="evidence-head"><div><FileText /><span><strong>{pack.name}</strong><small>{pack.demo ? 'DEMO DATA · ' : ''}{pack.evidence.length} evidence items</small></span></div><label className="upload-button"><input type="file" multiple accept=".docx,.pdf,.txt,.md,.markdown" onChange={event => upload(event.target.files)} />{uploading ? <LoaderCircle className="spin" /> : <Upload />}{uploading ? 'Reading…' : 'Add documents'}</label></div><div className="topic-list">{pack.topics.slice(0, 7).map(topic => <span key={topic}>{topic}</span>)}</div><button className="save-pack" onClick={() => download(`${pack.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`, JSON.stringify(pack, null, 2), 'application/json')}><Download />Save evidence pack</button></div>;
}

function CuePanel({ cue, dismiss, regenerate, pin, loading }: { cue: Cue; dismiss: () => void; regenerate: () => void; pin: () => void; loading: boolean }) {
  return <div className="cue-card"><section className="question-block"><span>QUESTION</span><h3>{cue.question}</h3></section><section><span>ANSWER CUES</span><ol>{cue.answerCues.slice(0, 3).map((item, index) => <li key={item}><b>{index + 1}</b><p>{item}</p></li>)}</ol></section><section className={`best-evidence ${cue.grounded ? '' : 'unsupported'}`}><span>BEST EVIDENCE</span><p>{cue.bestEvidence}</p><small><FileText />{cue.evidenceSource}</small></section><div className="bridge-grid"><section><span>BRIDGE</span><p>{cue.bridge}</p></section><section><span>OPTIONAL FOLLOW UP</span><p>{cue.followUp}</p></section></div>{(cue.challenge || cue.action) && <div className="meeting-extras">{cue.challenge && <p><strong>POINT TO CHALLENGE</strong>{cue.challenge}</p>}{cue.action && <p><strong>ACTION TO CAPTURE</strong>{cue.action}</p>}</div>}<div className="cue-actions"><button onClick={dismiss}><X />Dismiss</button><button onClick={pin}><Pin />Pin</button><button onClick={regenerate} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} />Regenerate</button></div></div>;
}
