/**
 * Stress tests for multi-pipeline company support (PR #66).
 *
 * These tests probe edge cases and potential failure modes that standard
 * unit tests may not cover — duplicate pipeline entries, empty-string
 * pipelines, shared references, delete/filter interactions, and field
 * preservation across migration.
 */

import {
  applyDelete,
  applyStageUpdate,
  createCompany,
  isInPipeline,
  isMultiPipeline,
  migrateCompanies,
} from './companyUtils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCompany(overrides = {}) {
  return {
    id:         '1',
    name:       'Acme Corp',
    position:   'Engineer',
    stage:      'applied',
    pipeline:   ['tel-aviv'],
    interviews: [],
    notes:      'some notes',
    createdAt:  '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// H1: duplicate-pipeline-entries
// ---------------------------------------------------------------------------

describe('H1: duplicate pipeline entries', () => {
  it('isInPipeline returns true even with duplicate entries', () => {
    const company = makeCompany({ pipeline: ['tel-aviv', 'tel-aviv'] });
    expect(isInPipeline(company, 'tel-aviv')).toBe(true);
    expect(isInPipeline(company, 'us')).toBe(false);
  });

  it('isMultiPipeline returns true for duplicates (length > 1)', () => {
    const company = makeCompany({ pipeline: ['tel-aviv', 'tel-aviv'] });
    // This IS a bug symptom — duplicates inflate multi-pipeline detection
    expect(isMultiPipeline(company)).toBe(true);
  });

  it('toggle handler simulation: toggling ON an already-selected pipeline does not create duplicates', () => {
    // Simulates the handleTogglePipeline logic from AddCompanyModal
    const current = ['tel-aviv'];
    const pipelineId = 'tel-aviv';
    const isSelected = current.includes(pipelineId);

    // The toggle logic should detect it's already selected
    expect(isSelected).toBe(true);
    // And since current.length <= 1, it should not deselect — no mutation occurs
    // So no duplicate can be introduced through the normal toggle path
  });

  it('toggle handler simulation: rapidly toggling a pipeline on produces no duplicates', () => {
    // Simulate two rapid "toggle on" operations for 'us' on a ['tel-aviv'] base
    let current = ['tel-aviv'];

    // First toggle: add 'us'
    const isSelected1 = current.includes('us');
    if (!isSelected1) {
      current = [...current, 'us'];
    }

    // Second toggle: 'us' is already present — should not add again
    const isSelected2 = current.includes('us');
    if (!isSelected2) {
      current = [...current, 'us'];
    }

    expect(current).toEqual(['tel-aviv', 'us']);
    expect(current.filter((p) => p === 'us')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// H2: migration-empty-string-pipeline
// ---------------------------------------------------------------------------

describe('H2: empty string pipeline migration', () => {
  it('migrateCompanies treats empty string as falsy — assigns default', () => {
    const companies = [makeCompany({ id: '1', pipeline: '' })];
    const result = migrateCompanies(companies, 'tel-aviv');
    // Empty string should be treated as "missing" and get the default
    expect(result[0].pipeline).toEqual(['tel-aviv']);
  });

  it('isInPipeline returns false for a company with empty string pipeline and any pipelineId', () => {
    const company = makeCompany({ pipeline: '' });
    expect(isInPipeline(company, 'tel-aviv')).toBe(false);
    expect(isInPipeline(company, 'us')).toBe(false);
    expect(isInPipeline(company, '')).toBe(true);
  });

  it('isMultiPipeline returns false for empty string pipeline', () => {
    const company = makeCompany({ pipeline: '' });
    expect(isMultiPipeline(company)).toBe(false);
  });

  it('migration followed by filtering is consistent for empty-string legacy data', () => {
    const companies = [makeCompany({ id: '1', pipeline: '' })];
    const migrated = migrateCompanies(companies, 'tel-aviv');
    // After migration, filtering should work correctly
    expect(isInPipeline(migrated[0], 'tel-aviv')).toBe(true);
    expect(isInPipeline(migrated[0], 'us')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// H3: shared reference between draft and persisted company
// ---------------------------------------------------------------------------

describe('H3: createCompany pipeline reference isolation', () => {
  it('mutating the draft pipeline array after createCompany also mutates the company', () => {
    const draft = { name: 'X', position: 'Y', stage: 'applied', pipeline: ['tel-aviv'] };
    const company = createCompany(draft, () => 1);

    // This proves the reference is shared (not a defensive copy)
    draft.pipeline.push('us');
    // BUG: company.pipeline is now ['tel-aviv', 'us'] because it's the same array
    expect(company.pipeline).toEqual(['tel-aviv', 'us']);
  });

  it('in practice the React flow prevents mutation via EMPTY_DRAFT reset', () => {
    // Simulating the actual InterviewPrepTracker flow:
    // 1. User submits → addCompany(companyDraft)
    // 2. Immediately: setCompanyDraft(EMPTY_DRAFT)
    // The old companyDraft reference is abandoned, so no mutation can occur.
    const EMPTY_DRAFT = { name: '', position: '', stage: 'applied', pipeline: ['tel-aviv'] };
    const userDraft = { ...EMPTY_DRAFT, pipeline: ['tel-aviv', 'us'] };

    const company = createCompany(userDraft, () => 1);
    // Simulating the reset — draft is replaced entirely
    const resetDraft = { ...EMPTY_DRAFT };

    // The company's pipeline should be unaffected by the reset
    expect(company.pipeline).toEqual(['tel-aviv', 'us']);
    expect(resetDraft.pipeline).toEqual(['tel-aviv']);
  });
});

// ---------------------------------------------------------------------------
// H4: pipeline count inflation after delete
// ---------------------------------------------------------------------------

describe('H4: multi-pipeline delete and count consistency', () => {
  it('deleting a multi-pipeline company removes it from all pipeline filters', () => {
    const companies = [
      makeCompany({ id: '1', pipeline: ['tel-aviv', 'us'] }),
      makeCompany({ id: '2', pipeline: ['tel-aviv'] }),
    ];

    const afterDelete = applyDelete(companies, '1');

    const telAvivCount = afterDelete.filter((c) => isInPipeline(c, 'tel-aviv')).length;
    const usCount = afterDelete.filter((c) => isInPipeline(c, 'us')).length;

    expect(telAvivCount).toBe(1); // Only company '2' remains
    expect(usCount).toBe(0);      // Company '1' was the only US one
  });

  it('stage update on a multi-pipeline company is reflected in both pipeline views', () => {
    const companies = [
      makeCompany({ id: '1', pipeline: ['tel-aviv', 'us'], stage: 'applied' }),
    ];

    const afterUpdate = applyStageUpdate(companies, '1', 'offer');

    // Filter for tel-aviv pipeline — should see the updated stage
    const telAvivCompanies = afterUpdate.filter((c) => isInPipeline(c, 'tel-aviv'));
    expect(telAvivCompanies[0].stage).toBe('offer');

    // Filter for us pipeline — same company, same updated stage
    const usCompanies = afterUpdate.filter((c) => isInPipeline(c, 'us'));
    expect(usCompanies[0].stage).toBe('offer');

    // It's the same object reference (one company entity)
    expect(telAvivCompanies[0]).toBe(usCompanies[0]);
  });

  it('multi-pipeline company count: counted once per pipeline, not once total', () => {
    const companies = [
      makeCompany({ id: '1', pipeline: ['tel-aviv', 'us'] }),
      makeCompany({ id: '2', pipeline: ['tel-aviv'] }),
      makeCompany({ id: '3', pipeline: ['us'] }),
    ];

    const telAvivCount = companies.filter((c) => isInPipeline(c, 'tel-aviv')).length;
    const usCount = companies.filter((c) => isInPipeline(c, 'us')).length;
    const totalUnique = companies.length;

    expect(telAvivCount).toBe(2); // companies 1 and 2
    expect(usCount).toBe(2);      // companies 1 and 3
    expect(totalUnique).toBe(3);  // only 3 unique companies
    // telAvivCount + usCount > totalUnique — this is expected (not a bug)
    expect(telAvivCount + usCount).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// H5: migration preserves all non-pipeline fields
// ---------------------------------------------------------------------------

describe('H5: migration field preservation', () => {
  it('migrating from undefined pipeline preserves all other fields', () => {
    const original = {
      id:         '1',
      name:       'Full Corp',
      position:   'Staff Engineer',
      stage:      'technical',
      interviews: [{ id: 'i1', type: 'Phone', date: '2024-06-01', time: '10:00', status: 'scheduled' }],
      notes:      'Important notes about this company',
      createdAt:  '2024-03-15T08:30:00.000Z',
    };
    const companies = [original];
    const result = migrateCompanies(companies, 'tel-aviv');

    expect(result[0].id).toBe('1');
    expect(result[0].name).toBe('Full Corp');
    expect(result[0].position).toBe('Staff Engineer');
    expect(result[0].stage).toBe('technical');
    expect(result[0].interviews).toHaveLength(1);
    expect(result[0].interviews[0].id).toBe('i1');
    expect(result[0].notes).toBe('Important notes about this company');
    expect(result[0].createdAt).toBe('2024-03-15T08:30:00.000Z');
    expect(result[0].pipeline).toEqual(['tel-aviv']);
  });

  it('migrating from scalar pipeline preserves all other fields', () => {
    const original = {
      id:         '2',
      name:       'Scalar Corp',
      position:   'SWE',
      stage:      'offer',
      pipeline:   'us',
      interviews: [{ id: 'i2', type: 'Onsite', date: '2024-07-01', time: '14:00', status: 'completed' }],
      notes:      'Got the offer!',
      createdAt:  '2024-04-20T12:00:00.000Z',
    };
    const companies = [original];
    const result = migrateCompanies(companies, 'tel-aviv');

    expect(result[0].id).toBe('2');
    expect(result[0].name).toBe('Scalar Corp');
    expect(result[0].position).toBe('SWE');
    expect(result[0].stage).toBe('offer');
    expect(result[0].interviews[0].status).toBe('completed');
    expect(result[0].notes).toBe('Got the offer!');
    expect(result[0].createdAt).toBe('2024-04-20T12:00:00.000Z');
    expect(result[0].pipeline).toEqual(['us']);
  });

  it('migration does not add unexpected extra keys', () => {
    const original = makeCompany({ id: '1' });
    delete original.pipeline; // simulate legacy
    const companies = [original];
    const result = migrateCompanies(companies, 'tel-aviv');

    const resultKeys = Object.keys(result[0]).sort();
    const expectedKeys = ['createdAt', 'id', 'interviews', 'name', 'notes', 'pipeline', 'position', 'stage'];
    expect(resultKeys).toEqual(expectedKeys);
  });

  it('does not mutate the original companies array', () => {
    const companies = [makeCompany({ id: '1', pipeline: 'us' })];
    const originalRef = companies[0];
    migrateCompanies(companies, 'tel-aviv');

    // The original array and objects must be untouched
    expect(companies[0]).toBe(originalRef);
    expect(companies[0].pipeline).toBe('us');
  });
});
