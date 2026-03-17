import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddCompanyModal } from './AddCompanyModal';
import { ACTIVE_STAGES, STAGE_LABELS } from '../../constants/stages';
import { POSITIONS } from '../../constants/positions';
import { PIPELINES, PIPELINE_LABELS } from '../../constants/pipelines';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDraft(overrides = {}) {
  return { name: '', position: '', stage: 'applied', pipeline: ['tel-aviv'], ...overrides };
}

function setup(draftOverrides = {}, handlers = {}) {
  const draft = makeDraft(draftOverrides);
  const onDraftChange = handlers.onDraftChange ?? vi.fn();
  const onAdd        = handlers.onAdd        ?? vi.fn();
  const onClose      = handlers.onClose      ?? vi.fn();

  render(
    <AddCompanyModal
      draft={draft}
      onDraftChange={onDraftChange}
      onAdd={onAdd}
      onClose={onClose}
      stages={ACTIVE_STAGES}
      stageLabels={STAGE_LABELS}
      positions={POSITIONS}
      pipelines={PIPELINES}
      pipelineLabels={PIPELINE_LABELS}
    />
  );

  return { onDraftChange, onAdd, onClose };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('AddCompanyModal — rendering', () => {
  it('renders the modal heading', () => {
    setup();
    expect(screen.getByRole('heading', { name: /add company/i })).toBeInTheDocument();
  });

  it('renders a Company Name text input', () => {
    setup();
    expect(screen.getByLabelText(/company name/i)).toBeInTheDocument();
  });

  it('renders a Position dropdown with a blank placeholder', () => {
    setup();
    const select = screen.getByLabelText(/position/i);
    expect(select).toBeInTheDocument();
    expect(screen.getByText('Select a position…')).toBeInTheDocument();
  });

  it('renders all position options from the POSITIONS constant', () => {
    setup();
    POSITIONS.forEach((p) => {
      expect(screen.getByRole('option', { name: p })).toBeInTheDocument();
    });
  });

  it('renders all active stage options (Closed excluded)', () => {
    setup();
    ACTIVE_STAGES.forEach((s) => {
      expect(screen.getByRole('option', { name: STAGE_LABELS[s] })).toBeInTheDocument();
    });
    // "Closed" should not appear in the dropdown
    expect(screen.queryByRole('option', { name: /closed/i })).not.toBeInTheDocument();
  });

  it('renders Add Company and Cancel buttons', () => {
    setup();
    expect(screen.getByRole('button', { name: /add company/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Pipeline toggle buttons
// ---------------------------------------------------------------------------

describe('AddCompanyModal — pipeline toggles', () => {
  const user = userEvent.setup();
  it('renders a toggle button for each pipeline', () => {
    setup();
    PIPELINES.forEach((p) => {
      expect(screen.getByRole('button', { name: PIPELINE_LABELS[p] })).toBeInTheDocument();
    });
  });

  it('shows the active pipeline as pressed', () => {
    setup({ pipeline: ['tel-aviv'] });
    const telAvivBtn = screen.getByRole('button', { name: 'Tel Aviv' });
    const usBtn = screen.getByRole('button', { name: 'US' });
    expect(telAvivBtn).toHaveAttribute('aria-pressed', 'true');
    expect(usBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onDraftChange with both pipelines when toggling a second pipeline on', async () => {
    const { onDraftChange } = setup({ pipeline: ['tel-aviv'] });
    await user.click(screen.getByRole('button', { name: 'US' }));
    expect(onDraftChange).toHaveBeenCalledWith(
      expect.objectContaining({ pipeline: ['tel-aviv', 'us'] })
    );
  });

  it('calls onDraftChange removing a pipeline when toggling it off', async () => {
    const { onDraftChange } = setup({ pipeline: ['tel-aviv', 'us'] });
    await user.click(screen.getByRole('button', { name: 'US' }));
    expect(onDraftChange).toHaveBeenCalledWith(
      expect.objectContaining({ pipeline: ['tel-aviv'] })
    );
  });

  it('does not deselect the last remaining pipeline', async () => {
    const { onDraftChange } = setup({ pipeline: ['tel-aviv'] });
    await user.click(screen.getByRole('button', { name: 'Tel Aviv' }));
    // onDraftChange should NOT be called since we can't deselect the last one
    expect(onDraftChange).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Validation — errors only shown after first submit
// ---------------------------------------------------------------------------

describe('AddCompanyModal — validation', () => {
  const user = userEvent.setup();
  it('does not show validation errors before submitting', () => {
    setup();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows name error after clicking Add with empty name', async () => {
    setup();
    await user.click(screen.getByRole('button', { name: /add company/i }));
    expect(screen.getByText(/company name is required/i)).toBeInTheDocument();
  });

  it('shows position error after clicking Add with no position selected', async () => {
    setup({ name: 'Google' });
    await user.click(screen.getByRole('button', { name: /add company/i }));
    expect(screen.getByText(/please select a position/i)).toBeInTheDocument();
  });

  it('shows pipeline error when pipeline array is empty', async () => {
    setup({ name: 'Google', position: POSITIONS[0], pipeline: [] });
    await user.click(screen.getByRole('button', { name: /add company/i }));
    expect(screen.getByText(/select at least one pipeline/i)).toBeInTheDocument();
  });

  it('does not call onAdd when form is invalid', async () => {
    const { onAdd } = setup();
    await user.click(screen.getByRole('button', { name: /add company/i }));
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('calls onAdd when name, position, and pipeline are provided', async () => {
    const { onAdd } = setup({ name: 'Google', position: POSITIONS[0], pipeline: ['tel-aviv'] });
    await user.click(screen.getByRole('button', { name: /add company/i }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Focus management
// ---------------------------------------------------------------------------

describe('AddCompanyModal — focus management', () => {
  const user = userEvent.setup();
  it('focuses the first input on mount', () => {
    setup();
    expect(document.activeElement).toBe(screen.getByLabelText(/company name/i));
  });

  it('traps focus forward from the last button to the first input', async () => {
    setup();
    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    cancelBtn.focus();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText(/company name/i));
  });

  it('traps focus backward from the first input to the last button', async () => {
    setup();
    const nameInput = screen.getByLabelText(/company name/i);
    nameInput.focus();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /cancel/i }));
  });
});

// ---------------------------------------------------------------------------
// Callbacks
// ---------------------------------------------------------------------------

describe('AddCompanyModal — callbacks', () => {
  const user = userEvent.setup();

  it('calls onDraftChange when the company name input changes', async () => {
    const { onDraftChange } = setup();
    await user.type(screen.getByLabelText(/company name/i), 'A');
    expect(onDraftChange).toHaveBeenCalled();
  });

  it('calls onClose when the Cancel button is clicked', async () => {
    const { onClose } = setup();
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Edit mode
// ---------------------------------------------------------------------------

function setupEditMode(draftOverrides = {}, handlers = {}) {
  const editingCompany = {
    id: 'c1', name: 'Vayu', position: 'Software Engineering Manager',
    stage: 'applied', pipeline: ['tel-aviv'], interviews: [],
  };
  const draft = makeDraft({ name: 'Vayu', position: 'Software Engineering Manager', ...draftOverrides });
  const onDraftChange = handlers.onDraftChange ?? vi.fn();
  const onAdd         = handlers.onAdd         ?? vi.fn();
  const onEdit        = handlers.onEdit        ?? vi.fn();
  const onClose       = handlers.onClose       ?? vi.fn();

  render(
    <AddCompanyModal
      draft={draft}
      onDraftChange={onDraftChange}
      onAdd={onAdd}
      onEdit={onEdit}
      onClose={onClose}
      stages={ACTIVE_STAGES}
      stageLabels={STAGE_LABELS}
      positions={POSITIONS}
      pipelines={PIPELINES}
      pipelineLabels={PIPELINE_LABELS}
      editingCompany={editingCompany}
    />
  );

  return { onDraftChange, onAdd, onEdit, onClose };
}

describe('AddCompanyModal — edit mode', () => {
  const user = userEvent.setup();

  it('renders "Edit Company" heading in edit mode', () => {
    setupEditMode();
    expect(screen.getByRole('heading', { name: /edit company/i })).toBeInTheDocument();
  });

  it('renders "Save Changes" button instead of "Add Company"', () => {
    setupEditMode();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add company/i })).not.toBeInTheDocument();
  });

  it('disables the company name input', () => {
    setupEditMode();
    expect(screen.getByLabelText(/company name/i)).toBeDisabled();
  });

  it('calls onEdit (not onAdd) when submitting in edit mode', async () => {
    const { onEdit, onAdd } = setupEditMode({ position: POSITIONS[0] });
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onAdd).not.toHaveBeenCalled();
  });
});
