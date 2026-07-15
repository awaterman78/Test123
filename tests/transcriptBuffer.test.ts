import { describe, expect, it } from 'vitest';
import { TranscriptBuffer } from '../src/lib/transcriptBuffer';

describe('transcript buffer', () => {
  it('updates partials and enforces its rolling limit', () => {
    const buffer = new TranscriptBuffer(2);
    buffer.update('1', 'Hel', true, 1);
    buffer.update('1', 'Hello', false, 2);
    buffer.update('2', 'Second', false, 3);
    buffer.update('3', 'Third', false, 4);
    expect(buffer.all()).toEqual([
      { id: '2', text: 'Second', partial: false, at: 3 },
      { id: '3', text: 'Third', partial: false, at: 4 }
    ]);
  });
});
