import { retrieveEvidence } from './evidence';
import type { Cue, EvidencePack, Mode } from '../types';

export async function requestCue(question: string, mode: Mode, instructions: string, pack: EvidencePack, token = '') {
  const response = await fetch('/api/cues', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ question, mode, instructions, evidence: retrieveEvidence(question, pack) })
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'LiveCue could not generate a response.');
  return body as Cue;
}
