import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompanyQuestionSection } from './CompanyQuestionSection';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQuestion(id, overrides = {}) {
  return { id, title: `Question ${id}`, url: `https://example.com/${id}`, difficulty: 'Medium', ...overrides };
}

function setup({
  companyName       = 'Google',
  totalQuestions    = 3,
  totalSeen         = 0,
  availableQuestions = [makeQuestion('q1'), makeQuestion('q2')],
  handlers          = {},
} = {}) {
  const onMarkSeen = handlers.onMarkSeen ?? jest.fn();
  const onReset    = handlers.onReset    ?? jest.fn();

  render(
    <CompanyQuestionSection
      companyName={companyName}
      totalQuestions={totalQuestions}
      totalSeen={totalSeen}
      availableQuestions={availableQuestions}
      onMarkSeen={onMarkSeen}
      onReset={onReset}
    />
  );

  return { onMarkSeen, onReset };
}

// ---------------------------------------------------------------------------
// Rendering — normal state (questions available)
// ---------------------------------------------------------------------------

describe('CompanyQuestionSection — with available questions', () => {
  it('renders the company name as a heading', () => {
    setup();
    expect(screen.getByText('Google')).toBeInTheDocument();
  });

  it('shows the seen / total progress', () => {
    setup({ totalSeen: 1, totalQuestions: 5 });
    expect(screen.getByText('1 / 5 completed')).toBeInTheDocument();
  });

  it('renders a QuestionCard for each available question', () => {
    setup({ availableQuestions: [makeQuestion('q1'), makeQuestion('q2'), makeQuestion('q3')] });
    expect(screen.getByText('Question q1')).toBeInTheDocument();
    expect(screen.getByText('Question q2')).toBeInTheDocument();
    expect(screen.getByText('Question q3')).toBeInTheDocument();
  });

  it('does not show the "all seen" completion message', () => {
    setup();
    expect(screen.queryByText(/you've seen all/i)).not.toBeInTheDocument();
  });

  it('does not show the Reset button when questions are still available', () => {
    setup();
    expect(screen.queryByRole('button', { name: /reset/i })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Rendering — completed state (no questions left)
// ---------------------------------------------------------------------------

describe('CompanyQuestionSection — completed state', () => {
  function setupCompleted(companyName = 'Google') {
    return setup({ companyName, totalQuestions: 3, totalSeen: 3, availableQuestions: [] });
  }

  it('shows the "all seen" completion message', () => {
    setupCompleted();
    expect(screen.getByText(/you've seen all available questions/i)).toBeInTheDocument();
  });

  it('shows a Reset button', () => {
    setupCompleted();
    expect(screen.getByRole('button', { name: /reset google questions/i })).toBeInTheDocument();
  });

  it('does not render any QuestionCards', () => {
    setupCompleted();
    expect(screen.queryByRole('link', { name: /watch/i })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Callbacks
// ---------------------------------------------------------------------------

describe('CompanyQuestionSection — callbacks', () => {
  const user = userEvent.setup();

  it('calls onReset with the company name when the Reset button is clicked', async () => {
    const { onReset } = setup({
      companyName:        'Meta',
      availableQuestions: [],
      totalQuestions:     2,
      totalSeen:          2,
    });
    await user.click(screen.getByRole('button', { name: /reset meta questions/i }));
    expect(onReset).toHaveBeenCalledWith('Meta');
  });

  it('passes onMarkSeen down to QuestionCard', async () => {
    const { onMarkSeen } = setup({
      availableQuestions: [makeQuestion('q1')],
    });
    await user.click(screen.getByRole('button', { name: /mark seen/i }));
    expect(onMarkSeen).toHaveBeenCalledWith('q1');
  });
});
