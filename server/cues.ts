export interface CueInput {
  question: string;
  mode: 'Interview' | 'Meeting' | 'Negotiation' | 'Sales' | 'General';
  instructions: string;
  evidence: Array<{ id: string; type: string; text: string; topics: string[]; source: { document: string; section?: string } }>;
}

export function buildCuePrompt(input: CueInput) {
  const evidence = input.evidence.map(item => `[${item.source.document}${item.source.section ? `, ${item.source.section}` : ''}] ${item.text}`).join('\n');
  const policy = input.mode === 'Interview'
    ? 'Use only supplied evidence or confirmed instructions. Never invent experience, clients, figures, qualifications or history. If unsupported, set bestEvidence exactly to No grounded evidence found and grounded false.'
    : 'Base claims on supplied evidence. Distinguish a proposed response from a verified fact.';
  return `You are LiveCue, a silent meeting copilot. ${policy}\nMode: ${input.mode}\nUser instructions: ${input.instructions}\nQuestion: ${input.question}\nEvidence:\n${evidence || 'No evidence supplied.'}\nReturn no more than three short, natural answer cues. Never write a long script. Name the source document for the best evidence.`;
}

export function localCue(input: CueInput) {
  const evidence = input.evidence[0];
  if (!evidence && input.mode === 'Interview') return {
    question: input.question, answerCues: ['Be honest about the gap', 'Explain the closest relevant experience', 'Offer how you would close the gap'],
    bestEvidence: 'No grounded evidence found', evidenceSource: 'None',
    bridge: 'I would be transparent about where my experience is strongest and where I would need to learn.',
    followUp: 'Which part of that experience matters most in this role?', challenge: '', action: '', grounded: false
  };
  return {
    question: input.question.replace(/\s+/g, ' ').trim(),
    answerCues: evidence ? [`Lead with: ${evidence.text.slice(0, 105)}`, 'Connect it directly to the outcome', 'Keep the example specific and natural'] : ['Clarify the question before committing', 'State what you know with confidence', 'Confirm the next step'],
    bestEvidence: evidence?.text ?? 'No grounded evidence found', evidenceSource: evidence?.source.document ?? 'None',
    bridge: evidence ? 'That example gives me a practical basis for handling this.' : 'I do not have enough grounded information to make that claim.',
    followUp: 'What would a strong outcome look like from your perspective?',
    challenge: input.mode === 'Meeting' ? 'Check the assumption and its commercial impact.' : '',
    action: input.mode === 'Meeting' ? 'Capture the owner and due date.' : '', grounded: Boolean(evidence)
  };
}
