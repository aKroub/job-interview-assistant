import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrepContentView } from './PrepContentView';
import { SYSTEM_DESIGN_QUESTIONS } from '../../constants/questions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The company names that PrepContentView will render sections for. */
const COMPANIES = Object.keys(SYSTEM_DESIGN_QUESTIONS);

function setup({ handlers = {}, seenIds = new Set() } = {}) {
  const onMarkSeen     = handlers.onMarkSeen     ?? jest.fn();
  const onResetCompany = handlers.onResetCompany ?? jest.fn();

  /** Mimics useSeenQuestions.getAvailableQuestionsFor — returns up to 3 unseen questions. */
  function getAvailableQuestionsFor(companyName) {
    const all = SYSTEM_DESIGN_QUESTIONS[companyName] ?? [];
    return all.filter((q) => !seenIds.has(q.id)).slice(0, 3);
  }

  /** Mimics useSeenQuestions.getTotalSeenFor. */
  function getTotalSeenFor(companyName) {
    const all = SYSTEM_DESIGN_QUESTIONS[companyName] ?? [];
    return all.filter((q) => seenIds.has(q.id)).length;
  }

  render(
    <PrepContentView
      getAvailableQuestionsFor={getAvailableQuestionsFor}
      getTotalSeenFor={getTotalSeenFor}
      onMarkSeen={onMarkSeen}
      onResetCompany={onResetCompany}
    />
  );

  return { onMarkSeen, onResetCompany };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('PrepContentView — rendering', () => {
  it('renders the Interview Prep Resources heading', () => {
    setup();
    expect(screen.getByText('Interview Prep Resources')).toBeInTheDocument();
  });

  it('renders the System Design Practice info banner', () => {
    setup();
    expect(screen.getByText(/system design practice/i)).toBeInTheDocument();
  });

  it('renders a section for every company in SYSTEM_DESIGN_QUESTIONS', () => {
    setup();
    COMPANIES.forEach((company) => {
      expect(screen.getByText(company)).toBeInTheDocument();
    });
  });

  it('renders question cards for the available questions', () => {
    setup();
    // At least one "Watch" link should exist (there are questions in the bank)
    const watchLinks = screen.getAllByRole('link', { name: /watch/i });
    expect(watchLinks.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Callbacks
// ---------------------------------------------------------------------------

describe('PrepContentView — callbacks', () => {
  const user = userEvent.setup();

  it('calls onMarkSeen with the question id when Mark Seen is clicked', async () => {
    const { onMarkSeen } = setup();
    // Click the first "Mark Seen" button in the list
    await user.click(screen.getAllByRole('button', { name: /mark seen/i })[0]);
    expect(onMarkSeen).toHaveBeenCalledTimes(1);
    expect(typeof onMarkSeen.mock.calls[0][0]).toBe('string');
  });

  it('calls onResetCompany with the company name when a Reset button is clicked', async () => {
    // Mark all questions for the first company as seen so the Reset button appears
    const firstCompany = COMPANIES[0];
    const allIds       = new Set(SYSTEM_DESIGN_QUESTIONS[firstCompany].map((q) => q.id));
    const { onResetCompany } = setup({ seenIds: allIds });

    await user.click(
      screen.getByRole('button', { name: new RegExp(`reset ${firstCompany} questions`, 'i') })
    );
    expect(onResetCompany).toHaveBeenCalledWith(firstCompany);
  });
});
