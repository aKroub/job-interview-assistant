import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddCompanyModal } from './AddCompanyModal';
import { ACTIVE_STAGES, STAGE_LABELS } from '../../constants/stages';
import { POSITIONS } from '../../constants/positions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDraft(overrides = {}) {
  return { name: '', position: '', stage: 'applied', ...overrides };
}

function setup(draftOverrides = {}, handlers = {}, { pipelineLabel = 'Tel Aviv' } = {}) {
  const draft = makeDraft(draftOverrides);
  const onDraftChange = handlers.onDraftChange ?? jest.fn();
  const onAdd        = handlers.onAdd        ?? jest.fn();
  const onClose      = handlers.onClose      ?? jest.fn();

  render(
    <AddCompanyModal
      draft={draft}
      onDraftChange={onDraftChange}
      onAdd={onAdd}
      onClose={onClose}
      stages={ACTIVE_STAGES}
      stageLabels={STAGE_LABELS}
      positions={POSITIONS}
      pipelineLabel={pipelineLabel}
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

  it('renders the pipeline label badge', () => {
    setup({}, {}, { pipelineLabel: 'US' });
    expect(screen.getByText('US')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Validation — errors only shown after first submit
// ---------------------------------------------------------------------------

describe('AddCompanyModal — validation', () => {
  it('does not show validation errors before submitting', () => {
    setup();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows name error after clicking Add with empty name', async () => {
    setup();
    userEvent.click(screen.getByRole('button', { name: /add company/i }));
    expect(screen.getByText(/company name is required/i)).toBeInTheDocument();
  });

  it('shows position error after clicking Add with no position selected', async () => {
    setup({ name: 'Google' });
    userEvent.click(screen.getByRole('button', { name: /add company/i }));
    expect(screen.getByText(/please select a position/i)).toBeInTheDocument();
  });

  it('does not call onAdd when form is invalid', async () => {
    const { onAdd } = setup();
    userEvent.click(screen.getByRole('button', { name: /add company/i }));
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('calls onAdd when both name and position are provided', async () => {
    const { onAdd } = setup({ name: 'Google', position: POSITIONS[0] });
    userEvent.click(screen.getByRole('button', { name: /add company/i }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Callbacks
// ---------------------------------------------------------------------------

describe('AddCompanyModal — callbacks', () => {
  it('calls onDraftChange when the company name input changes', async () => {
    const { onDraftChange } = setup();
    userEvent.type(screen.getByLabelText(/company name/i), 'A');
    expect(onDraftChange).toHaveBeenCalled();
  });

  it('calls onClose when the Cancel button is clicked', async () => {
    const { onClose } = setup();
    userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
