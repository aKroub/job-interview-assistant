import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InterviewCard } from './InterviewCard';
import { AddInterviewModal } from './AddInterviewModal';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInterview(overrides = {}) {
  return {
    id:          'i1',
    companyId:   'c1',
    companyName: 'Acme Corp',
    position:    'Senior Engineer',
    type:        'Video Interview',
    date:        '2099-06-01',
    time:        '10:00',
    duration:    60,
    status:      'scheduled',
    ...overrides,
  };
}

function renderCard(interviewOverrides = {}) {
  const interview = makeInterview(interviewOverrides);
  render(
    <InterviewCard
      interview={interview}
      onDeleteInterview={vi.fn()}
      onEdit={vi.fn()}
      onUpdateInterview={vi.fn()}
      highlightedInterviewId={null}
      onHighlightComplete={vi.fn()}
    />
  );
  return interview;
}

const COMPANIES = [{ id: 'c1', name: 'Acme', position: 'SWE' }];
const TYPES = ['Phone Interview', 'Video Interview'];

function renderModal(props = {}) {
  const onAdd = props.onAdd ?? vi.fn();
  const onClose = props.onClose ?? vi.fn();
  const onEdit = props.onEdit ?? vi.fn();
  render(
    <AddInterviewModal
      companies={COMPANIES}
      interviewTypes={TYPES}
      onAdd={onAdd}
      onClose={onClose}
      onEdit={onEdit}
      interview={props.interview ?? null}
      initialValues={props.initialValues ?? null}
    />
  );
  return { onAdd, onClose, onEdit };
}

// ---------------------------------------------------------------------------
// H2: Video link survives round-trip through suggestion acceptance flows
// ---------------------------------------------------------------------------

describe('H2 — Video link round-trip through add/edit/cancel flows', () => {
  it('passes videoCallLink through onAdd when scheduling via modal', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderModal({
      onAdd,
      initialValues: {
        companyId: 'c1',
        type: 'Video Interview',
        date: '2099-06-01',
        time: '10:00',
        videoCallLink: 'https://zoom.us/j/123456',
      },
    });

    await user.click(screen.getByText('Schedule'));
    expect(onAdd).toHaveBeenCalledWith('c1', expect.objectContaining({
      videoCallLink: 'https://zoom.us/j/123456',
    }));
  });

  it('passes videoCallLink through onEdit when saving changes', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const interview = makeInterview({ type: 'Video Interview', videoCallLink: 'https://meet.google.com/abc-defg-hij' });

    renderModal({ interview, onEdit });

    await user.click(screen.getByText('Save Changes'));
    expect(onEdit).toHaveBeenCalledWith('c1', 'i1', expect.objectContaining({
      videoCallLink: 'https://meet.google.com/abc-defg-hij',
    }));
  });

  it('preserves empty videoCallLink when none provided in add mode', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderModal({
      onAdd,
      initialValues: {
        companyId: 'c1',
        type: 'Video Interview',
        date: '2099-06-01',
        time: '10:00',
      },
    });

    await user.click(screen.getByText('Schedule'));
    expect(onAdd).toHaveBeenCalledWith('c1', expect.objectContaining({
      videoCallLink: '',
    }));
  });

  it('clears videoCallLink in edit mode when user empties the field', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const interview = makeInterview({ type: 'Video Interview', videoCallLink: 'https://zoom.us/j/old' });
    renderModal({ interview, onEdit });

    const input = screen.getByLabelText(/video call link/i);
    await user.clear(input);
    await user.click(screen.getByText('Save Changes'));

    expect(onEdit).toHaveBeenCalledWith('c1', 'i1', expect.objectContaining({
      videoCallLink: '',
    }));
  });
});

// ---------------------------------------------------------------------------
// H3: InterviewCard two-step toggle handles edge cases
// ---------------------------------------------------------------------------

describe('H3 — InterviewCard video link toggle edge cases', () => {
  it('shows toggle button for a valid https URL', () => {
    renderCard({ videoCallLink: 'https://zoom.us/j/123' });
    expect(screen.getByRole('button', { name: /show.*video call link/i })).toBeInTheDocument();
  });

  it('reveals link with correct href after toggle click', async () => {
    const user = userEvent.setup();
    renderCard({ videoCallLink: 'https://zoom.us/j/123' });
    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    expect(screen.getByRole('link', { name: /join.*video call/i })).toHaveAttribute(
      'href', 'https://zoom.us/j/123'
    );
  });

  it('shows toggle button for http URL (non-TLS)', () => {
    renderCard({ videoCallLink: 'http://internal.company.com/meeting/42' });
    expect(screen.getByRole('button', { name: /show.*video call link/i })).toBeInTheDocument();
  });

  it('renders "Add" toggle when videoCallLink is undefined', () => {
    renderCard({ videoCallLink: undefined });
    expect(screen.queryByRole('button', { name: /show.*video call link/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add.*video call link/i })).toBeInTheDocument();
  });

  it('renders "Add" toggle when videoCallLink is null', () => {
    renderCard({ videoCallLink: null });
    expect(screen.queryByRole('button', { name: /show.*video call link/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add.*video call link/i })).toBeInTheDocument();
  });

  it('renders "Add" toggle when videoCallLink is empty string', () => {
    renderCard({ videoCallLink: '' });
    expect(screen.queryByRole('button', { name: /show.*video call link/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add.*video call link/i })).toBeInTheDocument();
  });

  it('renders "Add" toggle for javascript: URI (invalid, not rendered as link)', () => {
    renderCard({ videoCallLink: 'javascript:alert(1)' });
    expect(screen.queryByRole('button', { name: /show.*video call link/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add.*video call link/i })).toBeInTheDocument();
  });

  it('renders "Add" toggle for data: URI (invalid, not rendered as link)', () => {
    renderCard({ videoCallLink: 'data:text/html,<h1>XSS</h1>' });
    expect(screen.queryByRole('button', { name: /show.*video call link/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add.*video call link/i })).toBeInTheDocument();
  });

  it('renders "Add" toggle for ftp: URI (invalid, not rendered as link)', () => {
    renderCard({ videoCallLink: 'ftp://files.example.com/meeting' });
    expect(screen.queryByRole('button', { name: /show.*video call link/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add.*video call link/i })).toBeInTheDocument();
  });

  it('does not show "Join call" link when panel is opened for invalid URI', async () => {
    const user = userEvent.setup();
    renderCard({ videoCallLink: 'javascript:alert(1)' });
    await user.click(screen.getByRole('button', { name: /add.*video call link/i }));
    expect(screen.queryByRole('link', { name: /join.*video call/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/video call url/i)).toBeInTheDocument();
  });

  it('does NOT render toggle for Phone Interview type even with valid URL', () => {
    renderCard({ type: 'Phone Interview', videoCallLink: 'https://zoom.us/j/123' });
    expect(screen.queryByRole('button', { name: /show.*video call link/i })).not.toBeInTheDocument();
  });

  it('does NOT render toggle for In-Person Interview type even with valid URL', () => {
    renderCard({ type: 'In-Person Interview', videoCallLink: 'https://zoom.us/j/123' });
    expect(screen.queryByRole('button', { name: /show.*video call link/i })).not.toBeInTheDocument();
  });

  it('handles very long URLs without crashing', async () => {
    const user = userEvent.setup();
    const longUrl = 'https://zoom.us/j/' + 'a'.repeat(5000);
    renderCard({ videoCallLink: longUrl });
    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    const link = screen.getByRole('link', { name: /join.*video call/i });
    expect(link).toHaveAttribute('href', longUrl);
  });

  it('handles URLs with special characters', async () => {
    const user = userEvent.setup();
    const url = 'https://zoom.us/j/123?pwd=abc%20def&token=<foo>';
    renderCard({ videoCallLink: url });
    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    expect(screen.getByRole('link', { name: /join.*video call/i })).toHaveAttribute('href', url);
  });

  it('opens revealed link in new tab with security attributes', async () => {
    const user = userEvent.setup();
    renderCard({ videoCallLink: 'https://meet.google.com/abc-defg-hij' });
    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    const link = screen.getByRole('link', { name: /join.*video call/i });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
  });

  it('toggles link visibility on repeated clicks', async () => {
    const user = userEvent.setup();
    renderCard({ videoCallLink: 'https://zoom.us/j/123' });

    // Initially hidden
    expect(screen.queryByRole('link', { name: /join.*video call/i })).not.toBeInTheDocument();

    // Click to show
    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    expect(screen.getByRole('link', { name: /join.*video call/i })).toBeInTheDocument();

    // Click to hide
    await user.click(screen.getByRole('button', { name: /hide video call panel/i }));
    expect(screen.queryByRole('link', { name: /join.*video call/i })).not.toBeInTheDocument();

    // Click to show again
    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    expect(screen.getByRole('link', { name: /join.*video call/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// H4: AddInterviewModal sanitization strips dangerous URIs
// ---------------------------------------------------------------------------

describe('H4 — AddInterviewModal sanitises dangerous video URIs', () => {
  const dangerousUris = [
    'javascript:alert(document.cookie)',
    'javascript:void(0)',
    'data:text/html,<script>alert(1)</script>',
    'data:application/javascript,alert(1)',
    'vbscript:msgbox("xss")',
    'blob:https://evil.com/uuid',
    'file:///etc/passwd',
    'ftp://evil.com/payload',
    // Edge cases — mixed case and whitespace
    'JavaScript:alert(1)',
    'JAVASCRIPT:alert(1)',
    '  javascript:alert(1)  ',
    'DATA:text/html,xss',
  ];

  it.each(dangerousUris)('strips dangerous URI: %s', async (uri) => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderModal({
      onAdd,
      initialValues: {
        companyId: 'c1',
        type: 'Video Interview',
        date: '2099-06-01',
        time: '10:00',
        videoCallLink: uri,
      },
    });

    await user.click(screen.getByText('Schedule'));

    expect(onAdd).toHaveBeenCalledWith('c1', expect.objectContaining({
      videoCallLink: '',
    }));
  });

  it.each(dangerousUris)('strips dangerous URI in edit mode: %s', async (uri) => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const interview = makeInterview({ type: 'Video Interview', videoCallLink: 'https://zoom.us/j/safe' });
    renderModal({ interview, onEdit });

    const input = screen.getByLabelText(/video call link/i);
    await user.clear(input);
    await user.type(input, uri);
    await user.click(screen.getByText('Save Changes'));

    expect(onEdit).toHaveBeenCalledWith('c1', 'i1', expect.objectContaining({
      videoCallLink: '',
    }));
  });

  it('preserves valid https URLs through sanitization', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const validUrls = [
      'https://zoom.us/j/123456789',
      'https://meet.google.com/abc-defg-hij',
      'https://teams.microsoft.com/l/meetup-join/19%3ameeting_123',
      'http://internal.corp/meeting/42',
    ];

    for (const url of validUrls) {
      onAdd.mockClear();
      const { unmount } = render(
        <AddInterviewModal
          companies={COMPANIES}
          interviewTypes={TYPES}
          onAdd={onAdd}
          onClose={vi.fn()}
          initialValues={{
            companyId: 'c1',
            type: 'Video Interview',
            date: '2099-06-01',
            time: '10:00',
            videoCallLink: url,
          }}
        />
      );

      await user.click(screen.getByText('Schedule'));
      expect(onAdd).toHaveBeenCalledWith('c1', expect.objectContaining({
        videoCallLink: url,
      }));
      unmount();
    }
  });
});
