import { INTERVIEW_TYPES, DURATION_OPTIONS, formatDuration } from './interviewTypes';
import { POSITIONS } from './positions';
import { SYSTEM_DESIGN_QUESTIONS } from './questions';
import { ACTIVE_STAGES, CLOSED_STAGE, STAGES, STAGE_LABELS } from './stages';

// ---------------------------------------------------------------------------
// stages
// ---------------------------------------------------------------------------

describe('STAGES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(STAGES)).toBe(true);
    expect(STAGES.length).toBeGreaterThan(0);
  });

  it('contains only string values', () => {
    STAGES.forEach((s) => expect(typeof s).toBe('string'));
  });

  it('contains the expected stage keys in order', () => {
    expect(STAGES).toEqual(['interested', 'applied', 'phone', 'technical', 'hr', 'offer', 'rejected']);
  });
});

describe('STAGE_LABELS', () => {
  it('has an entry for every stage key', () => {
    STAGES.forEach((key) => {
      expect(STAGE_LABELS).toHaveProperty(key);
    });
  });

  it('maps every key to a non-empty string label', () => {
    STAGES.forEach((key) => {
      expect(typeof STAGE_LABELS[key]).toBe('string');
      expect(STAGE_LABELS[key].length).toBeGreaterThan(0);
    });
  });

  it('uses "CV Screening" for the phone stage', () => {
    expect(STAGE_LABELS.phone).toBe('CV Screening');
  });

  it('uses "Closed" for the rejected stage', () => {
    expect(STAGE_LABELS.rejected).toBe('Closed');
  });
});

// ---------------------------------------------------------------------------
// ACTIVE_STAGES & CLOSED_STAGE
// ---------------------------------------------------------------------------

describe('ACTIVE_STAGES', () => {
  it('contains 6 stages (all except rejected)', () => {
    expect(ACTIVE_STAGES).toHaveLength(6);
  });

  it('does not include the rejected stage', () => {
    expect(ACTIVE_STAGES).not.toContain('rejected');
  });

  it('preserves the order from STAGES', () => {
    expect(ACTIVE_STAGES).toEqual(['interested', 'applied', 'phone', 'technical', 'hr', 'offer']);
  });
});

describe('CLOSED_STAGE', () => {
  it('equals "rejected"', () => {
    expect(CLOSED_STAGE).toBe('rejected');
  });

  it('is not included in ACTIVE_STAGES', () => {
    expect(ACTIVE_STAGES).not.toContain(CLOSED_STAGE);
  });
});

// ---------------------------------------------------------------------------
// positions
// ---------------------------------------------------------------------------

describe('POSITIONS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(POSITIONS)).toBe(true);
    expect(POSITIONS.length).toBeGreaterThan(0);
  });

  it('contains only non-empty strings', () => {
    POSITIONS.forEach((p) => {
      expect(typeof p).toBe('string');
      expect(p.length).toBeGreaterThan(0);
    });
  });

  it('has no duplicate values', () => {
    expect(new Set(POSITIONS).size).toBe(POSITIONS.length);
  });
});

// ---------------------------------------------------------------------------
// interviewTypes
// ---------------------------------------------------------------------------

describe('INTERVIEW_TYPES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(INTERVIEW_TYPES)).toBe(true);
    expect(INTERVIEW_TYPES.length).toBeGreaterThan(0);
  });

  it('contains only non-empty strings', () => {
    INTERVIEW_TYPES.forEach((t) => {
      expect(typeof t).toBe('string');
      expect(t.length).toBeGreaterThan(0);
    });
  });

  it('includes the three core types', () => {
    expect(INTERVIEW_TYPES).toContain('Phone Interview');
    expect(INTERVIEW_TYPES).toContain('Video Interview');
    expect(INTERVIEW_TYPES).toContain('In-Person Interview');
  });

  it('has no duplicate values', () => {
    expect(new Set(INTERVIEW_TYPES).size).toBe(INTERVIEW_TYPES.length);
  });
});

// ---------------------------------------------------------------------------
// DURATION_OPTIONS
// ---------------------------------------------------------------------------

describe('DURATION_OPTIONS', () => {
  it('is a non-empty array of positive numbers', () => {
    expect(Array.isArray(DURATION_OPTIONS)).toBe(true);
    expect(DURATION_OPTIONS.length).toBeGreaterThan(0);
    DURATION_OPTIONS.forEach((d) => {
      expect(typeof d).toBe('number');
      expect(d).toBeGreaterThan(0);
    });
  });

  it('includes the full-day option (480)', () => {
    expect(DURATION_OPTIONS).toContain(480);
  });

  it('is sorted in ascending order', () => {
    for (let i = 1; i < DURATION_OPTIONS.length; i++) {
      expect(DURATION_OPTIONS[i]).toBeGreaterThan(DURATION_OPTIONS[i - 1]);
    }
  });

  it('has no duplicate values', () => {
    expect(new Set(DURATION_OPTIONS).size).toBe(DURATION_OPTIONS.length);
  });
});

// ---------------------------------------------------------------------------
// formatDuration
// ---------------------------------------------------------------------------

describe('formatDuration', () => {
  it('formats sub-hour durations as minutes', () => {
    expect(formatDuration(15)).toBe('15 min');
    expect(formatDuration(30)).toBe('30 min');
    expect(formatDuration(45)).toBe('45 min');
  });

  it('formats exactly 60 minutes as "1 hr"', () => {
    expect(formatDuration(60)).toBe('1 hr');
  });

  it('formats multiples of 60 as hours with plural', () => {
    expect(formatDuration(120)).toBe('2 hrs');
  });

  it('formats non-whole-hour values above 60 as minutes', () => {
    expect(formatDuration(90)).toBe('90 min');
  });

  it('formats 480 as "Full day (8 hrs)"', () => {
    expect(formatDuration(480)).toBe('Full day (8 hrs)');
  });

  it('returns a string for every DURATION_OPTIONS value', () => {
    DURATION_OPTIONS.forEach((d) => {
      const label = formatDuration(d);
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// SYSTEM_DESIGN_QUESTIONS
// ---------------------------------------------------------------------------

describe('SYSTEM_DESIGN_QUESTIONS', () => {
  it('is a plain object with at least one company key', () => {
    expect(typeof SYSTEM_DESIGN_QUESTIONS).toBe('object');
    expect(Object.keys(SYSTEM_DESIGN_QUESTIONS).length).toBeGreaterThan(0);
  });

  it('has at least one question per company', () => {
    Object.entries(SYSTEM_DESIGN_QUESTIONS).forEach(([company, questions]) => {
      expect(Array.isArray(questions)).toBe(true);
      expect(questions.length).toBeGreaterThan(0);
    });
  });

  it('every question has id, title, url, and difficulty fields', () => {
    Object.values(SYSTEM_DESIGN_QUESTIONS).flat().forEach((q) => {
      expect(typeof q.id).toBe('string');
      expect(typeof q.title).toBe('string');
      expect(typeof q.url).toBe('string');
      expect(typeof q.difficulty).toBe('string');
    });
  });

  it('all question ids are unique across all companies', () => {
    const allIds = Object.values(SYSTEM_DESIGN_QUESTIONS).flat().map((q) => q.id);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('all question difficulties are one of Hard, Medium, or Easy', () => {
    const valid = new Set(['Hard', 'Medium', 'Easy']);
    Object.values(SYSTEM_DESIGN_QUESTIONS).flat().forEach((q) => {
      expect(valid.has(q.difficulty)).toBe(true);
    });
  });
});
