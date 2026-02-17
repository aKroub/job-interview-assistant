import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuestionCard } from './QuestionCard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQuestion(overrides = {}) {
  return {
    id:         'q1',
    title:      'Design a URL Shortener',
    url:        'https://example.com/url-shortener',
    difficulty: 'Medium',
    ...overrides,
  };
}

function setup(questionOverrides = {}, handlers = {}) {
  const question   = makeQuestion(questionOverrides);
  const onMarkSeen = handlers.onMarkSeen ?? jest.fn();
  render(<QuestionCard question={question} onMarkSeen={onMarkSeen} />);
  return { question, onMarkSeen };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('QuestionCard — rendering', () => {
  it('renders the question title', () => {
    setup();
    expect(screen.getByText('Design a URL Shortener')).toBeInTheDocument();
  });

  it('renders the difficulty badge', () => {
    setup({ difficulty: 'Hard' });
    expect(screen.getByText('Hard')).toBeInTheDocument();
  });

  it('renders a Watch link pointing to the question URL', () => {
    setup({ url: 'https://example.com/video' });
    const link = screen.getByRole('link', { name: /watch/i });
    expect(link).toHaveAttribute('href', 'https://example.com/video');
  });

  it('opens the Watch link in a new tab', () => {
    setup();
    const link = screen.getByRole('link', { name: /watch/i });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders the Mark Seen button', () => {
    setup();
    expect(screen.getByRole('button', { name: /mark seen/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Callbacks
// ---------------------------------------------------------------------------

describe('QuestionCard — callbacks', () => {
  it('calls onMarkSeen with the question id when Mark Seen is clicked', async () => {
    const { onMarkSeen } = setup({ id: 'q99' });
    userEvent.click(screen.getByRole('button', { name: /mark seen/i }));
    expect(onMarkSeen).toHaveBeenCalledWith('q99');
  });

  it('calls onMarkSeen exactly once per click', async () => {
    const { onMarkSeen } = setup();
    userEvent.click(screen.getByRole('button', { name: /mark seen/i }));
    expect(onMarkSeen).toHaveBeenCalledTimes(1);
  });
});
