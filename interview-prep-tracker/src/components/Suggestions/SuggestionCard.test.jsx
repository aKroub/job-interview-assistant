import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('SuggestionCard — rendering', () => {
  it('renders the company name', () => {
    render(<SuggestionCard suggestion={makeSuggestion()} onDismiss={() => {}} />);
    expect(screen.getByText('Google')).toBeInTheDocument();
  });

  it('renders the interview type', () => {
    render(<SuggestionCard suggestion={makeSuggestion()} onDismiss={() => {}} />);
    expect(screen.getByText('Video Interview')).toBeInTheDocument();
  });

  it('renders the date and time', () => {
    render(<SuggestionCard suggestion={makeSuggestion()} onDismiss={() => {}} />);
    expect(screen.getByText('2025-03-15 at 14:00')).toBeInTheDocument();
  });

  it('renders date only when time is absent', () => {
    render(
      <SuggestionCard suggestion={makeSuggestion({ time: '' })} onDismiss={() => {}} />
    );
    expect(screen.getByText('2025-03-15')).toBeInTheDocument();
  });

  it('renders the email subject', () => {
    render(<SuggestionCard suggestion={makeSuggestion()} onDismiss={() => {}} />);
    expect(screen.getByText('Technical Interview Invitation')).toBeInTheDocument();
  });

  it('renders the email snippet', () => {
    render(<SuggestionCard suggestion={makeSuggestion()} onDismiss={() => {}} />);
    expect(
      screen.getByText('We would like to invite you for a technical interview.')
    ).toBeInTheDocument();
  });

  it('renders the confidence percentage', () => {
    render(<SuggestionCard suggestion={makeSuggestion({ confidence: 0.92 })} onDismiss={() => {}} />);
    expect(screen.getByText('92% confidence')).toBeInTheDocument();
  });

  it('renders a dismiss button with accessible label', () => {
    render(<SuggestionCard suggestion={makeSuggestion()} onDismiss={() => {}} />);
    expect(
      screen.getByRole('button', { name: /dismiss google suggestion/i })
    ).toBeInTheDocument();
  });

  it('does not render date section when date is absent', () => {
    render(
      <SuggestionCard suggestion={makeSuggestion({ date: '', time: '' })} onDismiss={() => {}} />
    );
    // The date/time block should not appear — neither date nor time text present
    expect(screen.queryByText(/2025/)).not.toBeInTheDocument();
  });
});

describe('SuggestionCard — callbacks', () => {
  it('calls onDismiss with the suggestion id when dismiss is clicked', async () => {
    const onDismiss = jest.fn();
    render(<SuggestionCard suggestion={makeSuggestion()} onDismiss={onDismiss} />);

    await userEvent.click(screen.getByRole('button', { name: /dismiss google suggestion/i }));

    expect(onDismiss).toHaveBeenCalledWith('suggestion_msg1_evt1');
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
