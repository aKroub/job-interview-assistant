import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SuggestionPanel } from './SuggestionPanel';

function makeSuggestion(overrides = {}) {
  return {
    id: 'suggestion_msg1_evt1',
    companyName: 'Google',
    type: 'Video Interview',
    date: '2025-03-15',
    time: '14:00',
    subject: 'Technical Interview',
    emailSnippet: 'We would like to invite you.',
    confidence: 0.9,
    ...overrides,
  };
}

function setup({
  suggestions = [],
  authStatus = 'unauthenticated',
  connectionStatus = 'disconnected',
  handlers = {},
} = {}) {
  const onDismiss    = handlers.onDismiss    ?? jest.fn();
  const onAccept     = handlers.onAccept     ?? jest.fn();
  const onScan       = handlers.onScan       ?? jest.fn();
  const onReset      = handlers.onReset      ?? jest.fn();
  const onConnect    = handlers.onConnect    ?? jest.fn();
  const onDisconnect = handlers.onDisconnect ?? jest.fn();

  render(
    <SuggestionPanel
      suggestions={suggestions}
      authStatus={authStatus}
      connectionStatus={connectionStatus}
      onDismiss={onDismiss}
      onAccept={onAccept}
      onScan={onScan}
      onReset={onReset}
      onConnect={onConnect}
      onDisconnect={onDisconnect}
    />
  );

  return { onDismiss, onAccept, onScan, onReset, onConnect, onDisconnect };
}

describe('SuggestionPanel — rendering', () => {
  it('renders the panel heading', () => {
    setup();
    expect(screen.getByText('Interview Suggestions')).toBeInTheDocument();
  });

  it('shows checking state when authStatus is checking', () => {
    setup({ authStatus: 'checking' });
    expect(screen.getByText(/checking connection/i)).toBeInTheDocument();
  });

  it('shows connect prompt when unauthenticated', () => {
    setup({ authStatus: 'unauthenticated' });
    expect(screen.getByRole('button', { name: /connect google/i })).toBeInTheDocument();
  });

  it('shows empty state message when authenticated with no suggestions', () => {
    setup({ authStatus: 'authenticated', suggestions: [] });
    expect(screen.getByText(/no interview suggestions detected/i)).toBeInTheDocument();
  });

  it('shows scanning message when connecting with no suggestions', () => {
    setup({ authStatus: 'authenticated', connectionStatus: 'connecting', suggestions: [] });
    expect(screen.getByText(/scanning gmail and calendar/i)).toBeInTheDocument();
  });

  it('shows error state message when error with no suggestions', () => {
    setup({ authStatus: 'authenticated', connectionStatus: 'error', suggestions: [] });
    expect(screen.getByText(/unable to reach gmail & calendar.*retrying/i)).toBeInTheDocument();
  });

  it('renders a SuggestionCard for each suggestion', () => {
    setup({
      authStatus: 'authenticated',
      suggestions: [
        makeSuggestion({ id: 's1', companyName: 'Google' }),
        makeSuggestion({ id: 's2', companyName: 'Meta' }),
      ],
    });
    expect(screen.getByText('Google')).toBeInTheDocument();
    expect(screen.getByText('Meta')).toBeInTheDocument();
  });

  it('shows Scan now, Reset, and Disconnect buttons when authenticated', () => {
    setup({ authStatus: 'authenticated' });
    expect(screen.getByRole('button', { name: /scan now/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset suggestions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /disconnect google/i })).toBeInTheDocument();
  });

  it('does not show Scan now, Reset, or Disconnect when unauthenticated', () => {
    setup({ authStatus: 'unauthenticated' });
    expect(screen.queryByRole('button', { name: /scan now/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reset suggestions/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /disconnect google/i })).not.toBeInTheDocument();
  });
});

describe('SuggestionPanel — callbacks', () => {
  it('calls onConnect when Connect Google is clicked', async () => {
    const { onConnect } = setup({ authStatus: 'unauthenticated' });
    await userEvent.click(screen.getByRole('button', { name: /connect google/i }));
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('calls onScan when Scan now is clicked', async () => {
    const { onScan } = setup({ authStatus: 'authenticated' });
    await userEvent.click(screen.getByRole('button', { name: /scan now/i }));
    expect(onScan).toHaveBeenCalledTimes(1);
  });

  it('calls onReset when Reset is clicked and confirmed', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    const { onReset } = setup({ authStatus: 'authenticated' });
    await userEvent.click(screen.getByRole('button', { name: /reset suggestions/i }));
    expect(onReset).toHaveBeenCalledTimes(1);
    window.confirm.mockRestore();
  });

  it('does not call onReset when Reset is clicked but cancelled', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    const { onReset } = setup({ authStatus: 'authenticated' });
    await userEvent.click(screen.getByRole('button', { name: /reset suggestions/i }));
    expect(onReset).not.toHaveBeenCalled();
    window.confirm.mockRestore();
  });

  it('calls onDisconnect when Disconnect is clicked', async () => {
    const { onDisconnect } = setup({ authStatus: 'authenticated' });
    await userEvent.click(screen.getByRole('button', { name: /disconnect google/i }));
    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });

  it('calls onDismiss with the full suggestion object when a card is dismissed', async () => {
    const suggestion = makeSuggestion({ id: 's1', companyName: 'Google' });
    const { onDismiss } = setup({
      authStatus: 'authenticated',
      suggestions: [suggestion],
    });
    await userEvent.click(screen.getByRole('button', { name: /dismiss google suggestion/i }));
    expect(onDismiss).toHaveBeenCalledWith(suggestion);
  });

  it('calls onAccept with the suggestion when a card is clicked', async () => {
    const suggestion = makeSuggestion({ id: 's1', companyName: 'Google' });
    const { onAccept } = setup({
      authStatus: 'authenticated',
      suggestions: [suggestion],
    });
    await userEvent.click(screen.getByRole('button', { name: /schedule google interview/i }));
    expect(onAccept).toHaveBeenCalledWith(suggestion);
  });
});
