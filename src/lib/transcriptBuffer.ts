import type { TranscriptItem } from '../types';

export class TranscriptBuffer {
  private items: TranscriptItem[] = [];
  constructor(private maximum = 150) {}

  update(id: string, text: string, partial: boolean, at = Date.now()) {
    const next = { id, text, partial, at };
    this.items = [...this.items.filter(item => item.id !== id), next].slice(-this.maximum);
    return this.all();
  }

  all() { return this.items.map(item => ({ ...item })); }
  clear() { this.items = []; }
}
