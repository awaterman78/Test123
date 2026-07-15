import type { Sensitivity } from '../types';

const direct = /\?|^(who|what|when|where|why|how|can|could|would|will|do|does|did|is|are|have|has|tell me|walk me|give me)\b/i;
const implied = /\b(confirm|clarify|explain|talk (?:me|us) through|help me understand|your view|your thoughts|need a decision|agree that|comfortable with|commit to|what do you think|how would you|where do we land)\b/i;
const challenge = /\b(i'm not convinced|disagree|concerned|push back|why should|doesn't address|not acceptable|objection|what's the rationale)\b/i;

export function isQuestion(text: string, sensitivity: Sensitivity = 'Balanced') {
  const clean = text.trim();
  if (clean.length < 8) return false;
  if (direct.test(clean)) return true;
  if (sensitivity !== 'Low' && implied.test(clean)) return true;
  return sensitivity === 'High' && challenge.test(clean);
}

const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

export class DuplicateSuppressor {
  private seen = new Map<string, number>();
  constructor(private windowMs = 90_000) {}

  isDuplicate(text: string, now = Date.now()) {
    const clean = normalise(text);
    for (const [question, at] of this.seen) if (now - at > this.windowMs) this.seen.delete(question);
    const words = new Set(clean.split(' '));
    const duplicate = [...this.seen.keys()].some(existing => {
      const other = new Set(existing.split(' '));
      const overlap = [...words].filter(word => other.has(word)).length;
      return overlap / Math.max(words.size, other.size, 1) >= 0.72;
    });
    if (!duplicate) this.seen.set(clean, now);
    return duplicate;
  }
}
