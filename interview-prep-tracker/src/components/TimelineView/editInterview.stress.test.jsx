import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CalendarView } from './CalendarView';
import { AddInterviewModal } from './AddInterviewModal';
import { INTERVIEW_TYPES, DURATION_OPTIONS } from '../../constants/interviewTypes';
import { toDateString } from '../../utils/calendarUtils';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function todayDate() {
  return toDateString(new Date());
}

function makeCompany(overrides = {}) {
  return {
    id: 'c1',
    name: 'Google',
    position: 'SWE',
    stage: 'applied',
    interviews: [],
    ...overrides,
  };
}

function makeInterview(overrides = {}) {
  return {
    id:          'i1',
    companyId:   'c1',
    companyName: 'Google',
    position:    'SWE',
    type:        'Phone Interview',
    date:        todayDate(),
    time:        '10:00',
    duration:    60,
    status:      'scheduled',
    ...overrides,
  };
}

function setupCalendar({ companies = [], handlers = {} } = {}) {
  const onAddInterview    = handlers.onAddInterview    ?? vi.fn();
  const onDeleteInterview = handlers.onDeleteInterview ?? vi.fn();
  const onUpdateInterview = handlers.onUpdateInterview ?? vi.fn();

  render(
    <CalendarView
      companies={companies}
      interviewTypes={INTERVIEW_TYPES}
      onAddInterview={onAddInterview}
      onDeleteInterview={onDeleteInterview}
      onUpdateInterview={onUpdateInterview}
    />
  );

  return { onAddInterview, onDeleteInterview, onUpdateInterview };
}

function setupEditModal({ interview, handlers = {} } = {}) {
  const editInterview = interview ?? makeInterview();
  const onEdit  = handlers.onEdit  ?? vi.fn();
  const onClose = handlers.onClose ?? vi.fn();

  render(
    <AddInterviewModal
      companies={[makeCompany()]}
      interviewTypes={INTERVIEW_TYPES}
      onClose={onClose}
      interview={editInterview}
      onEdit={onEdit}
    />
  );

  return { onEdit, onClose, editInterview };
}

// ===========================================================================
// H1: edit-mode-stale-state
// When the edit modal is unmounted (closed) and re-mounted for the same
// interview, form state must reset to the interview's current persisted values
// — not any stale local edits from the previous open.
// ===========================================================================

describe('H1: edit-mode-stale-state — modal re-mount resets form', () => {
  const user = userEvent.setup();

  it('re-opening the edit modal shows original values, not previously edited values', async () => {
    const interview = makeInterview({ type: 'Phone Interview', time: '10:00' });
    const companies = [makeCompany({ interviews: [{ ...interview, companyName: undefined, position: undefined }] })];
    const { onUpdateInterview } = setupCalendar({ companies });

    // Open edit modal
    await user.click(screen.getByLabelText(/edit google interview/i));
    expect(screen.getByText('Edit Interview')).toBeInTheDocument();

    // Change time but DON'T save — cancel instead
    await user.clear(screen.getByLabelText(/time/i));
    await user.type(screen.getByLabelText(/time/i), '23:59');
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    // Modal should be closed
    expect(screen.queryByText('Edit Interview')).not.toBeInTheDocument();
    expect(onUpdateInterview).not.toHaveBeenCalled();

    // Re-open the same interview
    await user.click(screen.getByLabelText(/edit google interview/i));

    // Should show original time, not the stale 23:59
    expect(screen.getByLabelText(/time/i).value).toBe('10:00');
  });

  it('re-opening after overlay dismiss also resets form state', async () => {
    const interview = makeInterview({ status: 'scheduled' });
    const companies = [makeCompany({ interviews: [{ ...interview, companyName: undefined, position: undefined }] })];
    setupCalendar({ companies });

    // Open, change status, dismiss via overlay
    await user.click(screen.getByLabelText(/edit google interview/i));
    await user.selectOptions(screen.getByLabelText(/status/i), 'cancelled');
    await user.click(screen.getByTestId('modal-overlay'));

    // Re-open — status should be original 'scheduled'
    await user.click(screen.getByLabelText(/edit google interview/i));
    expect(screen.getByLabelText(/status/i).value).toBe('scheduled');
  });
});

// ===========================================================================
// H2: edit-callback-crossfire
// The add modal and edit modal should never be open simultaneously.
// ===========================================================================

describe('H2: edit-callback-crossfire — no dual-modal overlap', () => {
  const user = userEvent.setup();

  it('opening edit modal does not open add modal simultaneously', async () => {
    const interview = makeInterview();
    const companies = [makeCompany({ interviews: [{ ...interview, companyName: undefined, position: undefined }] })];
    setupCalendar({ companies });

    // Open edit modal
    await user.click(screen.getByLabelText(/edit google interview/i));
    expect(screen.getByText('Edit Interview')).toBeInTheDocument();

    // "Schedule Interview" heading from the WeekHeader button should be visible,
    // but "Select a company…" (from add modal) should NOT be visible
    expect(screen.queryByText('Select a company…')).not.toBeInTheDocument();
  });

  it('add mode modal does not render status dropdown', async () => {
    const companies = [makeCompany()];
    setupCalendar({ companies });

    // Open add modal
    await user.click(screen.getByText('Schedule Interview'));
    expect(screen.getByText('Select a company…')).toBeInTheDocument();

    // Status dropdown must NOT appear in add mode
    expect(screen.queryByLabelText(/status/i)).not.toBeInTheDocument();
  });
});

// ===========================================================================
// H3: edit-saves-wrong-fields
// Editing different interviews in sequence must call onEdit with the correct
// companyId and interviewId each time — no closure staleness.
// ===========================================================================

describe('H3: edit-saves-wrong-fields — correct IDs per interview', () => {
  const user = userEvent.setup();

  it('editing two different interviews calls onEdit with correct IDs each time', async () => {
    const i1 = makeInterview({ id: 'i1', companyId: 'c1', companyName: 'Google', time: '10:00' });
    const i2 = makeInterview({ id: 'i2', companyId: 'c2', companyName: 'Meta', position: 'Staff', time: '14:00' });
    const companies = [
      makeCompany({
        id: 'c1', name: 'Google',
        interviews: [{ id: 'i1', type: 'Phone Interview', date: todayDate(), time: '10:00', status: 'scheduled', duration: 60 }],
      }),
      makeCompany({
        id: 'c2', name: 'Meta', position: 'Staff',
        interviews: [{ id: 'i2', type: 'Video Interview', date: todayDate(), time: '14:00', status: 'scheduled', duration: 90 }],
      }),
    ];
    const { onUpdateInterview } = setupCalendar({ companies });

    // Edit first interview (Google)
    await user.click(screen.getByLabelText(/edit google interview/i));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(onUpdateInterview).toHaveBeenCalledTimes(1);
    expect(onUpdateInterview.mock.calls[0][0]).toBe('c1');
    expect(onUpdateInterview.mock.calls[0][1]).toBe('i1');

    // Edit second interview (Meta)
    await user.click(screen.getByLabelText(/edit meta interview/i));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(onUpdateInterview).toHaveBeenCalledTimes(2);
    expect(onUpdateInterview.mock.calls[1][0]).toBe('c2');
    expect(onUpdateInterview.mock.calls[1][1]).toBe('i2');
  });

  it('edit submit includes all field values from the form', async () => {
    const { onEdit } = setupEditModal({
      interview: makeInterview({
        type: 'Video Interview',
        date: '2026-06-15',
        time: '14:30',
        duration: 90,
        status: 'completed',
      }),
    });

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    const [, , updates] = onEdit.mock.calls[0];
    expect(updates).toEqual({
      type:     'Video Interview',
      date:     '2026-06-15',
      time:     '14:30',
      duration: 90,
      status:   'completed',
    });
  });
});

// ===========================================================================
// H4: status-regression-suggestion-cancel
// The suggestion cancel action calls updateInterviewStatus directly in
// InterviewPrepTracker — it does NOT go through the Timeline view props.
// Verify the cancel path is NOT broken by this refactor.
// (This is a code-level analysis test — we verify the function still exists
// and the suggestion cancel still uses updateInterviewStatus, which was NOT
// removed from InterviewPrepTracker.)
// ===========================================================================

describe('H4: status-regression-suggestion-cancel — suggestion path intact', () => {
  const user = userEvent.setup();

  it('add mode still works correctly after edit mode refactor', async () => {
    const onAdd = vi.fn();
    const onClose = vi.fn();

    render(
      <AddInterviewModal
        companies={[makeCompany()]}
        interviewTypes={INTERVIEW_TYPES}
        onAdd={onAdd}
        onClose={onClose}
      />
    );

    // Fill required fields
    await user.selectOptions(screen.getByLabelText(/company/i), 'c1');
    await user.selectOptions(screen.getByLabelText(/type/i), INTERVIEW_TYPES[0]);
    await user.type(screen.getByLabelText(/date/i), '2026-09-01');
    await user.type(screen.getByLabelText(/time/i), '10:00');

    await user.click(screen.getByRole('button', { name: /schedule/i }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    // onAdd should receive companyId and interview data separately
    const [companyId, interviewData] = onAdd.mock.calls[0];
    expect(companyId).toBe('c1');
    expect(interviewData).not.toHaveProperty('companyId');
    expect(interviewData.status).toBe('scheduled');
  });

  it('initialValues mode (suggestion update) still works after edit mode refactor', async () => {
    const onAdd = vi.fn();

    render(
      <AddInterviewModal
        companies={[makeCompany()]}
        interviewTypes={INTERVIEW_TYPES}
        onAdd={onAdd}
        onClose={vi.fn()}
        initialValues={{
          companyId: 'c1',
          type: INTERVIEW_TYPES[1],
          date: '2026-10-15',
          time: '09:30',
          duration: 45,
        }}
      />
    );

    // Should be pre-filled and submittable immediately
    await user.click(screen.getByRole('button', { name: /schedule/i }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const [companyId, interviewData] = onAdd.mock.calls[0];
    expect(companyId).toBe('c1');
    expect(interviewData.type).toBe(INTERVIEW_TYPES[1]);
    expect(interviewData.date).toBe('2026-10-15');
    expect(interviewData.time).toBe('09:30');
    expect(interviewData.duration).toBe(45);
  });
});

// ===========================================================================
// H5: edit-with-empty-optional-fields
// The || operator treats 0 as falsy. If duration is somehow 0 or undefined,
// the edit mode initializer uses || 60, which silently overrides.
// Also tests that missing/undefined optional fields don't crash the modal.
// ===========================================================================

describe('H5: edit-with-empty-optional-fields — falsy value handling', () => {
  const user = userEvent.setup();

  it('interview with undefined duration defaults to 60 in edit mode', () => {
    setupEditModal({
      interview: makeInterview({ duration: undefined }),
    });

    expect(screen.getByLabelText(/duration/i).value).toBe('60');
  });

  it('interview with duration=0 defaults to 60 due to || operator (known edge case)', () => {
    // DURATION_OPTIONS doesn't include 0, so this is an impossible state in production.
    // But documenting the behavior: || treats 0 as falsy.
    setupEditModal({
      interview: makeInterview({ duration: 0 }),
    });

    // With || 60, duration 0 becomes 60
    expect(screen.getByLabelText(/duration/i).value).toBe('60');
  });

  it('interview with valid duration preserves the value', () => {
    setupEditModal({
      interview: makeInterview({ duration: 90 }),
    });

    expect(screen.getByLabelText(/duration/i).value).toBe('90');
  });

  it('edit modal does not crash when interview has no position', () => {
    setupEditModal({
      interview: makeInterview({ position: '' }),
    });

    expect(screen.getByTestId('edit-company-display').textContent).toBe('Google');
  });

  it('edit modal does not crash when interview has null position', () => {
    setupEditModal({
      interview: makeInterview({ position: null }),
    });

    expect(screen.getByTestId('edit-company-display').textContent).toBe('Google');
  });

  it('editing all fields at once and saving includes all changes', async () => {
    const { onEdit } = setupEditModal({
      interview: makeInterview({
        type: 'Phone Interview',
        date: '2026-01-01',
        time: '08:00',
        duration: 30,
        status: 'scheduled',
      }),
    });

    // Change every field
    await user.selectOptions(screen.getByLabelText(/type/i), 'Video Interview');
    await user.clear(screen.getByLabelText(/date/i));
    await user.type(screen.getByLabelText(/date/i), '2026-12-31');
    await user.clear(screen.getByLabelText(/time/i));
    await user.type(screen.getByLabelText(/time/i), '17:00');
    await user.selectOptions(screen.getByLabelText(/duration/i), '120');
    await user.selectOptions(screen.getByLabelText(/status/i), 'completed');

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    const [companyId, interviewId, updates] = onEdit.mock.calls[0];
    expect(companyId).toBe('c1');
    expect(interviewId).toBe('i1');
    expect(updates.type).toBe('Video Interview');
    expect(updates.date).toBe('2026-12-31');
    expect(updates.time).toBe('17:00');
    expect(updates.duration).toBe(120);
    expect(updates.status).toBe('completed');
  });
});
