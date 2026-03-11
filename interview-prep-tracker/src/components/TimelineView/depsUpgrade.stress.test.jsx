import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddInterviewModal } from './AddInterviewModal';
import { INTERVIEW_TYPES, DURATION_OPTIONS } from '../../constants/interviewTypes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCompany(overrides = {}) {
  return {
    id:         'c1',
    name:       'Google',
    position:   'SWE',
    stage:      'applied',
    interviews: [],
    ...overrides,
  };
}

function setup({ companies, handlers = {}, initialValues = null, interview = null } = {}) {
  const companiesList = companies ?? [
    makeCompany({ id: 'c1', name: 'Google', position: 'SWE' }),
    makeCompany({ id: 'c2', name: 'Meta', position: 'Staff Engineer' }),
    makeCompany({ id: 'c3', name: 'Apple', position: 'iOS Developer' }),
  ];
  const onAdd   = handlers.onAdd   ?? jest.fn();
  const onClose = handlers.onClose ?? jest.fn();
  const onEdit  = handlers.onEdit  ?? jest.fn();

  render(
    <AddInterviewModal
      companies={companiesList}
      interviewTypes={INTERVIEW_TYPES}
      onAdd={onAdd}
      onClose={onClose}
      initialValues={initialValues}
      interview={interview}
      onEdit={onEdit}
    />
  );

  return { onAdd, onClose, onEdit };
}

// ===========================================================================
// H3: user-event v14 async timing — race conditions with rapid interactions
//
// user-event v14 made all methods fully async. The key changes:
// 1. setup() returns an object with async methods (already was in v13.5+)
// 2. All interactions must be awaited
// 3. Internal event dispatch timing changed
//
// We test:
// 1. Rapid sequential form fills don't lose values
// 2. Quick submit after fill doesn't race
// 3. Double-click on submit doesn't call handler twice
// 4. Tab navigation + immediate type doesn't lose focus
// 5. Select + type interleaving doesn't corrupt state
// ===========================================================================

describe('H3: user-event v14 — rapid sequential form fills', () => {
  it('retains all field values after rapid sequential fills', async () => {
    const user = userEvent.setup();
    setup();

    // Rapidly fill all fields without waiting between
    await user.selectOptions(screen.getByLabelText(/company/i), 'c1');
    await user.selectOptions(screen.getByLabelText(/type/i), INTERVIEW_TYPES[0]);
    await user.type(screen.getByLabelText(/date/i), '2025-09-15');
    await user.type(screen.getByLabelText(/time/i), '14:30');

    // All values should be preserved
    expect(screen.getByLabelText(/company/i).value).toBe('c1');
    expect(screen.getByLabelText(/type/i).value).toBe(INTERVIEW_TYPES[0]);
    expect(screen.getByLabelText(/date/i).value).toBe('2025-09-15');
    expect(screen.getByLabelText(/time/i).value).toBe('14:30');
  });

  it('retains values when switching between fields rapidly', async () => {
    const user = userEvent.setup();
    setup();

    // Fill company, then immediately switch to type, then back to date
    await user.selectOptions(screen.getByLabelText(/company/i), 'c2');
    await user.selectOptions(screen.getByLabelText(/type/i), INTERVIEW_TYPES[1]);
    await user.selectOptions(screen.getByLabelText(/duration/i), String(DURATION_OPTIONS[1]));
    await user.type(screen.getByLabelText(/date/i), '2025-10-01');
    await user.type(screen.getByLabelText(/time/i), '09:00');

    expect(screen.getByLabelText(/company/i).value).toBe('c2');
    expect(screen.getByLabelText(/type/i).value).toBe(INTERVIEW_TYPES[1]);
    expect(screen.getByLabelText(/duration/i).value).toBe(String(DURATION_OPTIONS[1]));
    expect(screen.getByLabelText(/date/i).value).toBe('2025-10-01');
    expect(screen.getByLabelText(/time/i).value).toBe('09:00');
  });
});

describe('H3: user-event v14 — quick submit after fill', () => {
  it('submits correct values when clicking submit immediately after filling last field', async () => {
    const user = userEvent.setup();
    const { onAdd } = setup();

    await user.selectOptions(screen.getByLabelText(/company/i), 'c1');
    await user.selectOptions(screen.getByLabelText(/type/i), INTERVIEW_TYPES[0]);
    await user.type(screen.getByLabelText(/date/i), '2025-09-15');
    await user.type(screen.getByLabelText(/time/i), '14:30');
    // Submit immediately after the last type
    await user.click(screen.getByRole('button', { name: /schedule/i }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const [companyId, interview] = onAdd.mock.calls[0];
    expect(companyId).toBe('c1');
    expect(interview.type).toBe(INTERVIEW_TYPES[0]);
    expect(interview.date).toBe('2025-09-15');
    expect(interview.time).toBe('14:30');
  });

  it('handles fill → change → submit sequence correctly', async () => {
    const user = userEvent.setup();
    const { onAdd } = setup();

    // Fill all fields
    await user.selectOptions(screen.getByLabelText(/company/i), 'c1');
    await user.selectOptions(screen.getByLabelText(/type/i), INTERVIEW_TYPES[0]);
    await user.type(screen.getByLabelText(/date/i), '2025-09-15');
    await user.type(screen.getByLabelText(/time/i), '14:30');

    // Change company and type before submitting
    await user.selectOptions(screen.getByLabelText(/company/i), 'c2');
    await user.selectOptions(screen.getByLabelText(/type/i), INTERVIEW_TYPES[2]);

    await user.click(screen.getByRole('button', { name: /schedule/i }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const [companyId, interview] = onAdd.mock.calls[0];
    expect(companyId).toBe('c2');
    expect(interview.type).toBe(INTERVIEW_TYPES[2]);
  });
});

describe('H3: user-event v14 — double-click protection', () => {
  it('does not double-submit when clicking submit button twice rapidly', async () => {
    const user = userEvent.setup();
    const { onAdd, onClose } = setup();

    // Fill required fields
    await user.selectOptions(screen.getByLabelText(/company/i), 'c1');
    await user.selectOptions(screen.getByLabelText(/type/i), INTERVIEW_TYPES[0]);
    await user.type(screen.getByLabelText(/date/i), '2025-09-15');
    await user.type(screen.getByLabelText(/time/i), '14:30');

    // Double-click the submit button
    await user.dblClick(screen.getByRole('button', { name: /schedule/i }));

    // onAdd should be called at most once (modal closes after first submit)
    // The second click may hit the overlay or not fire if the component unmounts
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});

describe('H3: user-event v14 — tab navigation timing', () => {
  it('maintains correct focus order through rapid tab presses', async () => {
    const user = userEvent.setup();
    setup();

    const companySelect = screen.getByLabelText(/company/i);
    expect(document.activeElement).toBe(companySelect);

    // Tab through all fields
    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText(/type/i));

    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText(/date/i));

    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText(/time/i));

    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText(/duration/i));
  });

  it('handles tab + immediate select without losing focus', async () => {
    const user = userEvent.setup();
    setup();

    // Tab to type field and immediately select a value
    await user.tab();
    await user.selectOptions(screen.getByLabelText(/type/i), INTERVIEW_TYPES[1]);

    expect(screen.getByLabelText(/type/i).value).toBe(INTERVIEW_TYPES[1]);
  });
});

describe('H3: user-event v14 — concurrent select + type operations', () => {
  it('handles alternating between select and type inputs without corruption', async () => {
    const user = userEvent.setup();
    setup();

    // Alternate between selects and type inputs
    await user.selectOptions(screen.getByLabelText(/company/i), 'c1');
    await user.type(screen.getByLabelText(/date/i), '2025-09-15');
    await user.selectOptions(screen.getByLabelText(/type/i), INTERVIEW_TYPES[0]);
    await user.type(screen.getByLabelText(/time/i), '14:30');
    await user.selectOptions(screen.getByLabelText(/duration/i), String(DURATION_OPTIONS[2]));

    // All values should be intact
    expect(screen.getByLabelText(/company/i).value).toBe('c1');
    expect(screen.getByLabelText(/date/i).value).toBe('2025-09-15');
    expect(screen.getByLabelText(/type/i).value).toBe(INTERVIEW_TYPES[0]);
    expect(screen.getByLabelText(/time/i).value).toBe('14:30');
    expect(screen.getByLabelText(/duration/i).value).toBe(String(DURATION_OPTIONS[2]));
  });

  it('maintains state correctly through edit mode rapid interactions', async () => {
    const user = userEvent.setup();
    const interview = {
      id:          'i1',
      companyId:   'c1',
      companyName: 'Google',
      position:    'SWE',
      type:        'Phone Interview',
      date:        '2025-10-15',
      time:        '09:30',
      duration:    60,
      status:      'scheduled',
    };
    const { onEdit } = setup({ interview });

    // Rapidly change multiple fields in edit mode
    await user.selectOptions(screen.getByLabelText(/type/i), INTERVIEW_TYPES[2]);
    await user.clear(screen.getByLabelText(/date/i));
    await user.type(screen.getByLabelText(/date/i), '2025-11-01');
    await user.clear(screen.getByLabelText(/time/i));
    await user.type(screen.getByLabelText(/time/i), '16:00');
    await user.selectOptions(screen.getByLabelText(/status/i), 'completed');

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    const [companyId, interviewId, updates] = onEdit.mock.calls[0];
    expect(companyId).toBe('c1');
    expect(interviewId).toBe('i1');
    expect(updates.type).toBe(INTERVIEW_TYPES[2]);
    expect(updates.date).toBe('2025-11-01');
    expect(updates.time).toBe('16:00');
    expect(updates.status).toBe('completed');
  });
});

describe('H3: user-event v14 — validation after rapid invalid-then-valid sequence', () => {
  it('clears validation errors after correcting fields', async () => {
    const user = userEvent.setup();
    const { onAdd } = setup();

    // First, submit with empty fields to trigger validation errors
    await user.click(screen.getByRole('button', { name: /schedule/i }));

    // Errors should be shown
    expect(screen.getByText(/please select a company/i)).toBeInTheDocument();
    expect(screen.getByText(/interview type is required/i)).toBeInTheDocument();

    // Now rapidly fill all fields and re-submit
    await user.selectOptions(screen.getByLabelText(/company/i), 'c1');
    await user.selectOptions(screen.getByLabelText(/type/i), INTERVIEW_TYPES[0]);
    await user.type(screen.getByLabelText(/date/i), '2025-09-15');
    await user.type(screen.getByLabelText(/time/i), '14:30');
    await user.click(screen.getByRole('button', { name: /schedule/i }));

    // onAdd should be called — validation should have cleared
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});
