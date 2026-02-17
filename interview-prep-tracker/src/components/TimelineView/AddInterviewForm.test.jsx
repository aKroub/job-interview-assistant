import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddInterviewForm } from './AddInterviewForm';
import { INTERVIEW_TYPES } from '../../constants/interviewTypes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setup({ companyId = 'c1', handlers = {} } = {}) {
  const onAdd = handlers.onAdd ?? jest.fn();
  render(<AddInterviewForm companyId={companyId} onAdd={onAdd} interviewTypes={INTERVIEW_TYPES} />);
  return { onAdd };
}

// ---------------------------------------------------------------------------
// Collapsed state (shows "Add Interview" button)
// ---------------------------------------------------------------------------

describe('AddInterviewForm — collapsed state', () => {
  it('renders the "Add Interview" button by default', () => {
    setup();
    expect(screen.getByRole('button', { name: /add interview/i })).toBeInTheDocument();
  });

  it('does not render the form fields in collapsed state', () => {
    setup();
    expect(screen.queryByLabelText(/type/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/date/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Expanding the form
// ---------------------------------------------------------------------------

describe('AddInterviewForm — expanded state', () => {
  function expand() {
    setup();
    userEvent.click(screen.getByRole('button', { name: /add interview/i }));
  }

  it('shows the type dropdown after clicking Add Interview', () => {
    expand();
    expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
  });

  it('shows the date input after clicking Add Interview', () => {
    expand();
    expect(screen.getByLabelText(/date/i)).toBeInTheDocument();
  });

  it('shows the time input after clicking Add Interview', () => {
    expand();
    expect(screen.getByLabelText(/time/i)).toBeInTheDocument();
  });

  it('renders all interview type options', () => {
    expand();
    INTERVIEW_TYPES.forEach((t) => {
      expect(screen.getByRole('option', { name: t })).toBeInTheDocument();
    });
  });

  it('includes a blank placeholder option', () => {
    expand();
    expect(screen.getByRole('option', { name: /select type/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Validation — errors shown only after attempting to submit
// ---------------------------------------------------------------------------

describe('AddInterviewForm — validation', () => {
  function openAndSubmit() {
    const { onAdd } = setup();
    userEvent.click(screen.getByRole('button', { name: /add interview/i }));
    userEvent.click(screen.getByRole('button', { name: /^add$/i }));
    return { onAdd };
  }

  it('shows type error after submitting with no type selected', () => {
    openAndSubmit();
    expect(screen.getByText(/interview type is required/i)).toBeInTheDocument();
  });

  it('shows date error after submitting with no date', () => {
    openAndSubmit();
    expect(screen.getByText(/date is required/i)).toBeInTheDocument();
  });

  it('shows time error after submitting with no time', () => {
    openAndSubmit();
    expect(screen.getByText(/time is required/i)).toBeInTheDocument();
  });

  it('does not call onAdd when any field is empty', () => {
    const { onAdd } = openAndSubmit();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('does not show errors before the first submit attempt', () => {
    setup();
    userEvent.click(screen.getByRole('button', { name: /add interview/i }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Successful submission
// ---------------------------------------------------------------------------

describe('AddInterviewForm — successful submission', () => {
  it('calls onAdd with companyId and the completed interview when valid', () => {
    const { onAdd } = setup({ companyId: 'company-42' });

    userEvent.click(screen.getByRole('button', { name: /add interview/i }));

    // Fill in all required fields
    userEvent.selectOptions(screen.getByLabelText(/type/i), INTERVIEW_TYPES[0]);
    userEvent.type(screen.getByLabelText(/date/i), '2025-09-01');
    userEvent.type(screen.getByLabelText(/time/i), '10:00');

    userEvent.click(screen.getByRole('button', { name: /^add$/i }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const [calledCompanyId, calledInterview] = onAdd.mock.calls[0];
    expect(calledCompanyId).toBe('company-42');
    expect(calledInterview.type).toBe(INTERVIEW_TYPES[0]);
    expect(calledInterview.status).toBe('scheduled');
  });

  it('collapses back to the button after a successful submission', () => {
    setup();

    userEvent.click(screen.getByRole('button', { name: /add interview/i }));
    userEvent.selectOptions(screen.getByLabelText(/type/i), INTERVIEW_TYPES[0]);
    userEvent.type(screen.getByLabelText(/date/i), '2025-09-01');
    userEvent.type(screen.getByLabelText(/time/i), '10:00');
    userEvent.click(screen.getByRole('button', { name: /^add$/i }));

    expect(screen.getByRole('button', { name: /add interview/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Cancel button
// ---------------------------------------------------------------------------

describe('AddInterviewForm — cancel', () => {
  it('collapses back to the button when Cancel is clicked', () => {
    setup();

    userEvent.click(screen.getByRole('button', { name: /add interview/i }));
    userEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.getByRole('button', { name: /add interview/i })).toBeInTheDocument();
  });
});
