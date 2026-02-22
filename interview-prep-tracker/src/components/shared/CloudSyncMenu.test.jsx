import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CloudSyncMenu } from './CloudSyncMenu';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultProps = {
  authStatus: 'authenticated',
  syncStatus: 'idle',
  lastSaved: null,
  syncError: null,
  onSave: jest.fn(),
  onLoad: jest.fn(),
};

function renderMenu(overrides = {}) {
  const props = { ...defaultProps, ...overrides, onSave: jest.fn(), onLoad: jest.fn(), ...overrides };
  render(<CloudSyncMenu {...props} />);
  return props;
}

async function openMenu() {
  await userEvent.click(screen.getByLabelText('Cloud sync settings'));
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('CloudSyncMenu — rendering', () => {
  it('renders the gear icon button', () => {
    renderMenu();
    expect(screen.getByLabelText('Cloud sync settings')).toBeInTheDocument();
  });

  it('does not show dropdown by default', () => {
    renderMenu();
    expect(screen.queryByText('Cloud Backup')).not.toBeInTheDocument();
  });

  it('opens dropdown when gear icon is clicked', async () => {
    renderMenu();
    await openMenu();
    expect(screen.getByText('Cloud Backup')).toBeInTheDocument();
  });

  it('shows Save and Load buttons in dropdown', async () => {
    renderMenu();
    await openMenu();
    expect(screen.getByText('Save to Drive')).toBeInTheDocument();
    expect(screen.getByText('Load from Drive')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Auth gating
// ---------------------------------------------------------------------------

describe('CloudSyncMenu — auth gating', () => {
  it('shows connect message when not authenticated', async () => {
    renderMenu({ authStatus: 'unauthenticated' });
    await openMenu();
    expect(screen.getByText('Connect Google to enable cloud backup')).toBeInTheDocument();
  });

  it('disables Save button when not authenticated', async () => {
    renderMenu({ authStatus: 'unauthenticated' });
    await openMenu();
    expect(screen.getByText('Save to Drive').closest('button')).toBeDisabled();
  });

  it('disables Load button when not authenticated', async () => {
    renderMenu({ authStatus: 'unauthenticated' });
    await openMenu();
    expect(screen.getByText('Load from Drive').closest('button')).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

describe('CloudSyncMenu — interactions', () => {
  it('calls onSave when Save to Drive is clicked', async () => {
    const props = renderMenu();
    await openMenu();
    await userEvent.click(screen.getByText('Save to Drive'));
    expect(props.onSave).toHaveBeenCalledTimes(1);
  });

  it('calls onLoad when Load from Drive is confirmed', async () => {
    window.confirm = jest.fn().mockReturnValue(true);
    const props = renderMenu();
    await openMenu();
    await userEvent.click(screen.getByText('Load from Drive'));
    expect(window.confirm).toHaveBeenCalled();
    expect(props.onLoad).toHaveBeenCalledTimes(1);
  });

  it('does not call onLoad when Load from Drive is cancelled', async () => {
    window.confirm = jest.fn().mockReturnValue(false);
    const props = renderMenu();
    await openMenu();
    await userEvent.click(screen.getByText('Load from Drive'));
    expect(window.confirm).toHaveBeenCalled();
    expect(props.onLoad).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Status feedback
// ---------------------------------------------------------------------------

describe('CloudSyncMenu — status feedback', () => {
  it('shows success message when syncStatus is success', async () => {
    renderMenu({ syncStatus: 'success' });
    await openMenu();
    expect(screen.getByText('Saved successfully')).toBeInTheDocument();
  });

  it('shows error message when syncStatus is error', async () => {
    renderMenu({ syncStatus: 'error', syncError: 'Upload failed' });
    await openMenu();
    expect(screen.getByText('Upload failed')).toBeInTheDocument();
  });

  it('shows "No backup yet" when authenticated with no lastSaved', async () => {
    renderMenu({ authStatus: 'authenticated', lastSaved: null });
    await openMenu();
    expect(screen.getByText('No backup yet')).toBeInTheDocument();
  });

  it('shows last saved timestamp when lastSaved is set', async () => {
    renderMenu({ lastSaved: '2026-02-22T10:00:00Z' });
    await openMenu();
    expect(screen.getByText(/Last backup:/)).toBeInTheDocument();
  });

  it('disables buttons while saving', async () => {
    renderMenu({ syncStatus: 'saving' });
    await openMenu();
    expect(screen.getByText('Save to Drive').closest('button')).toBeDisabled();
    expect(screen.getByText('Load from Drive').closest('button')).toBeDisabled();
  });

  it('disables buttons while loading', async () => {
    renderMenu({ syncStatus: 'loading' });
    await openMenu();
    expect(screen.getByText('Save to Drive').closest('button')).toBeDisabled();
    expect(screen.getByText('Load from Drive').closest('button')).toBeDisabled();
  });
});
