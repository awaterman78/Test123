import { describe, expect, it } from 'vitest';
import { demoPack, retrieveEvidence } from '../src/lib/evidence';

describe('evidence retrieval', () => {
  it('returns stakeholder evidence with its source', () => {
    const result = retrieveEvidence('How do you lead difficult stakeholders?', demoPack);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].source.document).toBeTruthy();
  });

  it('returns no fabricated match for an unrelated topic', () => {
    expect(retrieveEvidence('What is your experience designing spacecraft engines?', demoPack)).toEqual([]);
  });
});
