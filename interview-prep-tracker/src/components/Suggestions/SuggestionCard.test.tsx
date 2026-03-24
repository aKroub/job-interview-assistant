// @ts-nocheck
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { SuggestionCard } from './SuggestionCard';

function makeSuggestion(overrides = {}) {
  return {
    id: 'suggestion_msg1_evt1',
    companyName: 'Google',
    type: 'Video Interview',
    date: '2025-03-15',
    time: '14:00',
    subject: 'Technical Interview Invitation',
    emailSnippet: 'We would like to invite you for a technical interview.',
    confidence: 0.92,
    source: 'gmail+calendar',
    ...overrides,
  };
}

const noop = () => {};

describe('SuggestionCard — rendering', () => {
  it('renders the company name', () => {
    render(<SuggestionCard suggestion={makeSuggestion()} onDismiss={noop} onAccept={noop} />);
    expect(screen.getByText('Google')).toBeInTheDocument();
  });

  it('renders the interview type', () => {
    render(<SuggestionCard suggestion={makeSuggestion()} onDismiss={noop} onAccept={noop} />);
    expect(screen.getByText('Video Interview')).toBeInTheDocument();
  });

  it('renders the date and time', () => {
    render(<SuggestionCard suggestion={makeSuggestion()} onDismiss={noop} onAccept={noop} />);
    expect(screen.getByText('2025-03-15 at 14:00')).toBeInTheDocument();
  });

  it('renders date only when time is absent', () => {
    render(
      <SuggestionCard suggestion={makeSuggestion({ time: '' })} onDismiss={noop} onAccept={noop} />
    );
    expect(screen.getByText('2025-03-15')).toBeInTheDocument();
  });

  it('renders the email subject', () => {
    render(<SuggestionCard suggestion={makeSuggestion()} onDismiss={noop} onAccept={noop} />);
    expect(screen.getByText('Technical Interview Invitation')).toBeInTheDocument();
  });

  it('renders the email snippet', () => {
    render(<SuggestionCard suggestion={makeSuggestion()} onDismiss={noop} onAccept={noop} />);
    expect(
      screen.getByText('We would like to invite you for a technical interview.')
    ).toBeInTheDocument();
  });

  it('renders the confidence percentage', () => {
    render(<SuggestionCard suggestion={makeSuggestion({ confidence: 0.92 })} onDismiss={noop} onAccept={noop} />);
    expect(screen.getByText('92% confidence')).toBeInTheDocument();
  });

  it('renders 0% confidence when confidence is undefined', () => {
    render(<SuggestionCard suggestion={makeSuggestion({ confidence: undefined })} onDismiss={noop} onAccept={noop} />);
    expect(screen.getByText('0% confidence')).toBeInTheDocument();
  });

  it('renders 0% confidence when confidence is NaN', () => {
    render(<SuggestionCard suggestion={makeSuggestion({ confidence: NaN })} onDismiss={noop} onAccept={noop} />);
    expect(screen.getByText('0% confidence')).toBeInTheDocument();
  });

  it('renders 0% confidence when confidence is Infinity', () => {
    render(<SuggestionCard suggestion={makeSuggestion({ confidence: Infinity })} onDismiss={noop} onAccept={noop} />);
    expect(screen.getByText('0% confidence')).toBeInTheDocument();
  });

  it('renders a dismiss button with accessible label', () => {
    render(<SuggestionCard suggestion={makeSuggestion()} onDismiss={noop} onAccept={noop} />);
    expect(
      screen.getByRole('button', { name: /dismiss google suggestion/i })
    ).toBeInTheDocument();
  });

  it('renders a Schedule label', () => {
    render(<SuggestionCard suggestion={makeSuggestion()} onDismiss={noop} onAccept={noop} />);
    expect(screen.getByText('Schedule')).toBeInTheDocument();
  });

  it('does not render date section when date is absent', () => {
    render(
      <SuggestionCard suggestion={makeSuggestion({ date: '', time: '' })} onDismiss={noop} onAccept={noop} />
    );
    expect(screen.queryByText(/2025/)).not.toBeInTheDocument();
  });
});

describe('SuggestionCard — email-only suggestions', () => {
  const user = userEvent.setup();

  function makeEmailOnlySuggestion(overrides = {}) {
    return makeSuggestion({
      id: 'suggestion_gmail_msg1',
      source: 'gmail',
      confidence: 0.48,
      calendarEventId: '',
      duration: null,
      ...overrides,
    });
  }

  it('renders "Not on your calendar" badge for email-only source', () => {
    render(<SuggestionCard suggestion={makeEmailOnlySuggestion()} onDismiss={noop} onAccept={noop} />);
    expect(screen.getByText('Not on your calendar')).toBeInTheDocument();
  });

  it('does NOT render "Not on your calendar" badge for cross-referenced source', () => {
    render(<SuggestionCard suggestion={makeSuggestion()} onDismiss={noop} onAccept={noop} />);
    expect(screen.queryByText('Not on your calendar')).not.toBeInTheDocument();
  });

  it('applies amber styling to the card for email-only source', () => {
    render(<SuggestionCard suggestion={makeEmailOnlySuggestion()} onDismiss={noop} onAccept={noop} />);
    const card = screen.getByRole('button', { name: /schedule google interview/i });
    expect(card.className).toContain('bg-amber-50');
    expect(card.className).toContain('border-amber-200');
  });

  it('applies default purple styling to the card for cross-referenced source', () => {
    render(<SuggestionCard suggestion={makeSuggestion()} onDismiss={noop} onAccept={noop} />);
    const card = screen.getByRole('button', { name: /schedule google interview/i });
    expect(card.className).toContain('bg-white');
    expect(card.className).toContain('border-purple-200');
  });

  it('applies amber border to snippet for email-only source', () => {
    render(<SuggestionCard suggestion={makeEmailOnlySuggestion()} onDismiss={noop} onAccept={noop} />);
    const snippet = screen.getByText('We would like to invite you for a technical interview.');
    expect(snippet.className).toContain('border-amber-200');
  });

  it('applies purple border to snippet for cross-referenced source', () => {
    render(<SuggestionCard suggestion={makeSuggestion()} onDismiss={noop} onAccept={noop} />);
    const snippet = screen.getByText('We would like to invite you for a technical interview.');
    expect(snippet.className).toContain('border-purple-200');
  });

  it('calls onAccept with the email-only suggestion when card is clicked', async () => {
    const suggestion = makeEmailOnlySuggestion();
    const onAccept = vi.fn();
    render(<SuggestionCard suggestion={suggestion} onDismiss={noop} onAccept={onAccept} />);

    await user.click(screen.getByRole('button', { name: /schedule google interview/i }));

    expect(onAccept).toHaveBeenCalledWith(suggestion);
  });

  it('calls onDismiss with the full suggestion object when dismiss is clicked', async () => {
    const suggestion = makeEmailOnlySuggestion();
    const onDismiss = vi.fn();
    render(<SuggestionCard suggestion={suggestion} onDismiss={onDismiss} onAccept={noop} />);

    await user.click(screen.getByRole('button', { name: /dismiss google suggestion/i }));

    expect(onDismiss).toHaveBeenCalledWith(suggestion);
  });
});

describe('SuggestionCard — cancel action', () => {
  function makeCancelSuggestion(overrides = {}) {
    return makeSuggestion({
      id: 'suggestion_cancel_msg1_evt1',
      action: 'cancel',
      ...overrides,
    });
  }

  it('renders red theme for cancel action', () => {
    render(<SuggestionCard suggestion={makeCancelSuggestion()} onDismiss={noop} onAccept={noop} />);
    const card = screen.getByRole('button', { name: /cancel google interview/i });
    expect(card.className).toContain('bg-red-50');
    expect(card.className).toContain('border-red-200');
  });

  it('renders "Cancel Interview" button label', () => {
    render(<SuggestionCard suggestion={makeCancelSuggestion()} onDismiss={noop} onAccept={noop} />);
    expect(screen.getByText('Cancel Interview')).toBeInTheDocument();
  });

  it('has aria-label with "Cancel" verb', () => {
    render(<SuggestionCard suggestion={makeCancelSuggestion()} onDismiss={noop} onAccept={noop} />);
    expect(screen.getByRole('button', { name: /cancel google interview/i })).toBeInTheDocument();
  });

  it('applies red border to snippet', () => {
    render(<SuggestionCard suggestion={makeCancelSuggestion()} onDismiss={noop} onAccept={noop} />);
    const snippet = screen.getByText('We would like to invite you for a technical interview.');
    expect(snippet.className).toContain('border-red-200');
  });
});

describe('SuggestionCard — update action', () => {
  function makeUpdateSuggestion(overrides = {}) {
    return makeSuggestion({
      id: 'suggestion_update_msg1_evt1',
      action: 'update',
      ...overrides,
    });
  }

  it('renders blue theme for update action', () => {
    render(<SuggestionCard suggestion={makeUpdateSuggestion()} onDismiss={noop} onAccept={noop} />);
    const card = screen.getByRole('button', { name: /update google interview/i });
    expect(card.className).toContain('bg-blue-50');
    expect(card.className).toContain('border-blue-200');
  });

  it('renders "Update Interview" button label', () => {
    render(<SuggestionCard suggestion={makeUpdateSuggestion()} onDismiss={noop} onAccept={noop} />);
    expect(screen.getByText('Update Interview')).toBeInTheDocument();
  });

  it('has aria-label with "Update" verb', () => {
    render(<SuggestionCard suggestion={makeUpdateSuggestion()} onDismiss={noop} onAccept={noop} />);
    expect(screen.getByRole('button', { name: /update google interview/i })).toBeInTheDocument();
  });

  it('applies blue border to snippet', () => {
    render(<SuggestionCard suggestion={makeUpdateSuggestion()} onDismiss={noop} onAccept={noop} />);
    const snippet = screen.getByText('We would like to invite you for a technical interview.');
    expect(snippet.className).toContain('border-blue-200');
  });
});

describe('SuggestionCard — backward compat (no action field)', () => {
  it('defaults to "Schedule" label when action is missing', () => {
    const suggestion = makeSuggestion();
    delete suggestion.action;
    render(<SuggestionCard suggestion={suggestion} onDismiss={noop} onAccept={noop} />);
    expect(screen.getByText('Schedule')).toBeInTheDocument();
  });

  it('defaults to purple theme when action is missing', () => {
    const suggestion = makeSuggestion();
    delete suggestion.action;
    render(<SuggestionCard suggestion={suggestion} onDismiss={noop} onAccept={noop} />);
    const card = screen.getByRole('button', { name: /schedule google interview/i });
    expect(card.className).toContain('border-purple-200');
  });
});

describe('SuggestionCard — email-only cancel does NOT show amber', () => {
  it('uses red theme for email-only cancel (not amber)', () => {
    const suggestion = makeSuggestion({
      source: 'gmail',
      action: 'cancel',
    });
    render(<SuggestionCard suggestion={suggestion} onDismiss={noop} onAccept={noop} />);
    const card = screen.getByRole('button', { name: /cancel google interview/i });
    expect(card.className).toContain('bg-red-50');
    expect(card.className).not.toContain('bg-amber-50');
  });

  it('does NOT show "Not on your calendar" badge for email-only cancel', () => {
    const suggestion = makeSuggestion({
      source: 'gmail',
      action: 'cancel',
    });
    render(<SuggestionCard suggestion={suggestion} onDismiss={noop} onAccept={noop} />);
    expect(screen.queryByText('Not on your calendar')).not.toBeInTheDocument();
  });
});

describe('SuggestionCard — callbacks', () => {
  const user = userEvent.setup();

  it('calls onDismiss with the full suggestion object when dismiss is clicked', async () => {
    const suggestion = makeSuggestion();
    const onDismiss = vi.fn();
    render(<SuggestionCard suggestion={suggestion} onDismiss={onDismiss} onAccept={noop} />);

    await user.click(screen.getByRole('button', { name: /dismiss google suggestion/i }));

    expect(onDismiss).toHaveBeenCalledWith(suggestion);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not call onAccept when dismiss is clicked', async () => {
    const onAccept = vi.fn();
    render(<SuggestionCard suggestion={makeSuggestion()} onDismiss={noop} onAccept={onAccept} />);

    await user.click(screen.getByRole('button', { name: /dismiss google suggestion/i }));

    expect(onAccept).not.toHaveBeenCalled();
  });

  it('calls onAccept with the suggestion when the card is clicked', async () => {
    const suggestion = makeSuggestion();
    const onAccept = vi.fn();
    render(<SuggestionCard suggestion={suggestion} onDismiss={noop} onAccept={onAccept} />);

    await user.click(screen.getByRole('button', { name: /schedule google interview/i }));

    expect(onAccept).toHaveBeenCalledWith(suggestion);
    expect(onAccept).toHaveBeenCalledTimes(1);
  });
});
