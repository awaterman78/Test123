import * as mammoth from 'mammoth/mammoth.browser';
import type { EvidenceItem, EvidencePack } from '../types';

const stop = new Set('the a an and or but to of in on for with is are was were be been you your we our they their it this that how what why can could would should'.split(' '));
const words = (text: string) => text.toLowerCase().match(/[a-z0-9£%]+/g)?.filter(word => !stop.has(word)) ?? [];
const sentences = (text: string) => text.replace(/\r/g, '').split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(s => s.length > 20);

export async function extractFile(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'docx') return (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
  if (extension === 'pdf') {
    const [{ getDocument, GlobalWorkerOptions }, { default: workerUrl }] = await Promise.all([
      import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    ]);
    GlobalWorkerOptions.workerSrc = workerUrl;
    const pdf = await getDocument({ data: await file.arrayBuffer() }).promise;
    const pages: string[] = [];
    for (let index = 1; index <= pdf.numPages; index++) {
      const content = await (await pdf.getPage(index)).getTextContent();
      pages.push(content.items.map(item => 'str' in item ? item.str : '').join(' '));
    }
    return pages.join('\n');
  }
  if (['txt', 'md', 'markdown'].includes(extension ?? '')) return file.text();
  throw new Error(`${file.name} is not a supported DOCX, PDF, TXT or Markdown file.`);
}

export function buildEvidencePack(documents: Array<{ name: string; text: string }>): EvidencePack {
  const evidence: EvidenceItem[] = [];
  documents.forEach(document => {
    sentences(document.text).slice(0, 180).forEach((sentence, index) => {
      const quantified = /(?:£|\b)\d[\d,.]*\s*(?:%|million|m|k|people|projects|years)?\b/i.test(sentence);
      const situation = /\b(led|managed|resolved|negotiated|delivered|implemented|built|improved|reduced|increased|challenged)\b/i.test(sentence);
      const restriction = /\b(do not|must not|never claim|unsupported|prohibited)\b/i.test(sentence);
      const topics = [...new Set(words(sentence))].slice(0, 7);
      evidence.push({
        id: `${document.name}-${index}`,
        type: restriction ? 'restriction' : quantified ? 'achievement' : situation ? 'situation' : 'fact',
        text: sentence.slice(0, 650), topics,
        source: { document: document.name, section: `Extract ${index + 1}` }
      });
    });
  });
  const topicCounts = new Map<string, number>();
  evidence.flatMap(item => item.topics).forEach(topic => topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1));
  const topics = [...topicCounts].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([topic]) => topic);
  return {
    id: crypto.randomUUID(), name: documents.length === 1 ? documents[0].name : `${documents.length} document evidence pack`,
    createdAt: new Date().toISOString(), topics, likelyQuestions: [],
    prohibitedClaims: evidence.filter(item => item.type === 'restriction').map(item => item.text), evidence
  };
}

export function retrieveEvidence(question: string, pack: EvidencePack, limit = 6) {
  const terms = new Set(words(question));
  return pack.evidence.map(item => ({
    item,
    score: words(`${item.text} ${item.topics.join(' ')}`).reduce((sum, word) => sum + (terms.has(word) ? 2 : 0), 0)
      + item.topics.reduce((sum, topic) => sum + (question.toLowerCase().includes(topic) ? 3 : 0), 0)
  })).filter(result => result.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map(result => result.item);
}

export const demoPack: EvidencePack = {
  id: 'demo-commercial', name: 'Demo Commercial Director Evidence Pack', createdAt: new Date().toISOString(), demo: true,
  topics: ['leadership', 'commercial judgement', 'integration', 'contracts', 'stakeholders'],
  likelyQuestions: ['Tell me about a difficult stakeholder', 'What would you do in your first 90 days?'],
  prohibitedClaims: ['Do not name clients not present in source documents', 'Do not invent savings or project values'],
  evidence: [
    { id: 'd1', type: 'fact', text: 'Commercial Director accountable for commercial strategy across Core Controls and acquisition integration in the South.', topics: ['leadership', 'integration', 'commercial'], source: { document: 'DEMO Job Profile.md', section: 'Purpose' } },
    { id: 'd2', type: 'achievement', text: 'Delivered a major presentation to around 100 people despite significant nerves and received a strong response.', topics: ['leadership', 'communication', 'stakeholders'], source: { document: 'DEMO CV.md', section: 'Achievements' } },
    { id: 'd3', type: 'situation', text: 'Built a commercial governance approach covering contract review, deviation schedules and approval levels.', topics: ['contracts', 'risk', 'commercial judgement', 'governance'], source: { document: 'DEMO CV.md', section: 'Core controls' } },
    { id: 'd4', type: 'phrase', text: 'I focus first on understanding the facts, the commercial exposure and who owns the next action.', topics: ['style', 'risk', 'leadership'], source: { document: 'DEMO Speaking Notes.txt' } }
  ]
};
