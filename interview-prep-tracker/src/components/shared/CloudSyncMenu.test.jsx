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
  backups: [],
  onSave: vi.fn(),
  onLoad: vi.fn(),
};

function renderMenu(overrides = {}) {
  const props = { ...defaultProps, onSave: vi.fn(), onLoad: vi.fn(), ...overrides };
  render(<CloudSyncMenu {...props} />);
  return props;
}

const user = userEvent.setup();

async function openMenu() {
  await user.click(screen.getByLabelText('Cloud sync settings'));
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
    await user.click(screen.getByText('Save to Drive'));
    expect(props.onSave).toHaveBeenCalledTimes(1);
  });

  it('shows version list when Load from Drive is clicked', async () => {
    renderMenu({
      backups: [
        { fileId: 'f1', savedAt: '2026-02-22T10:00:00Z' },
        { fileId: 'f2', savedAt: '2026-02-21T09:00:00Z' },
      ],
    });
    await openMenu();
    await user.click(screen.getByText('Load from Drive'));

    // Version list should appear with Back button
    expect(screen.getByText('Back')).toBeInTheDocument();
    // Load from Drive button should be hidden (replaced by version list)
    expect(screen.queryByText('Load from Drive')).not.toBeInTheDocument();
  });

  it('shows "No backups available" when backups array is empty', async () => {
    renderMenu({ backups: [] });
    await openMenu();
    await user.click(screen.getByText('Load from Drive'));
    expect(screen.getByText('No backups available')).toBeInTheDocument();
  });

  it('shows "Latest" badge on first backup', async () => {
    renderMenu({
      backups: [
        { fileId: 'f1', savedAt: '2026-02-22T10:00:00Z' },
        { fileId: 'f2', savedAt: '2026-02-21T09:00:00Z' },
      ],
    });
    await openMenu();
    await user.click(screen.getByText('Load from Drive'));
    expect(screen.getByText('Latest')).toBeInTheDocument();
  });

  it('calls onLoad with fileId when a version is confirmed', async () => {
    window.confirm = vi.fn().mockReturnValue(true);
    const props = renderMenu({
      backups: [
        { fileId: 'f1', savedAt: '2026-02-22T10:00:00Z' },
        { fileId: 'f2', savedAt: '2026-02-21T09:00:00Z' },
      ],
    });
    await openMenu();
    await user.click(screen.getByText('Load from Drive'));

    // Click the second version (not the first/Latest)
    const versionButtons = screen.getAllByRole('button').filter(
      (btn) => btn.textContent.includes('2026')
    );
    await user.click(versionButtons[1]);

    expect(window.confirm).toHaveBeenCalled();
    expect(props.onLoad).toHaveBeenCalledWith('f2');
  });

  it('does not call onLoad when version selection is cancelled', async () => {
    window.confirm = vi.fn().mockReturnValue(false);
    const props = renderMenu({
      backups: [{ fileId: 'f1', savedAt: '2026-02-22T10:00:00Z' }],
    });
    await openMenu();
    await user.click(screen.getByText('Load from Drive'));

    const versionButtons = screen.getAllByRole('button').filter(
      (btn) => btn.textContent.includes('2026')
    );
    await user.click(versionButtons[0]);

    expect(window.confirm).toHaveBeenCalled();
    expect(props.onLoad).not.toHaveBeenCalled();
  });

  it('collapses version list when Back is clicked', async () => {
    renderMenu({
      backups: [{ fileId: 'f1', savedAt: '2026-02-22T10:00:00Z' }],
    });
    await openMenu();
    await user.click(screen.getByText('Load from Drive'));
    expect(screen.getByText('Back')).toBeInTheDocument();

    await user.click(screen.getByText('Back'));
    expect(screen.queryByText('Back')).not.toBeInTheDocument();
    expect(screen.getByText('Load from Drive')).toBeInTheDocument();
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
