export type Mode = 'Interview' | 'Meeting' | 'Negotiation' | 'Sales' | 'General';
export type Sensitivity = 'Low' | 'Balanced' | 'High';

export interface EvidenceItem {
  id: string;
  type: 'fact' | 'achievement' | 'situation' | 'phrase' | 'restriction';
  text: string;
  topics: string[];
  source: { document: string; section?: string };
}

export interface EvidencePack {
  id: string;
  name: string;
  createdAt: string;
  demo?: boolean;
  topics: string[];
  likelyQuestions: string[];
  prohibitedClaims: string[];
  evidence: EvidenceItem[];
}

export interface Cue {
  question: string;
  answerCues: string[];
  bestEvidence: string;
  evidenceSource: string;
  bridge: string;
  followUp: string;
  challenge?: string;
  action?: string;
  grounded: boolean;
}

export interface TranscriptItem {
  id: string;
  text: string;
  partial: boolean;
  at: number;
}
