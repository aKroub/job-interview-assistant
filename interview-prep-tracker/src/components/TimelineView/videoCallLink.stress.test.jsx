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
    type:        'Phone Interview',
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
      highlightedInterviewId={null}
      onHighlightComplete={vi.fn()}
    />
  );
  return interview;
}

const COMPANIES = [{ id: 'c1', name: 'Acme', position: 'SWE' }];
const TYPES = ['Phone Interview', 'Technical Interview'];

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
        type: 'Phone Interview',
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
    const interview = makeInterview({ videoCallLink: 'https://meet.google.com/abc-defg-hij' });

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
        type: 'Phone Interview',
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
    const interview = makeInterview({ videoCallLink: 'https://zoom.us/j/old' });
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
// H3: InterviewCard handles edge cases for video URLs
// ---------------------------------------------------------------------------

describe('H3 — InterviewCard video link edge cases', () => {
  it('renders Join call button for a valid https URL', () => {
    renderCard({ videoCallLink: 'https://zoom.us/j/123' });
    expect(screen.getByRole('link', { name: /join.*video call/i })).toHaveAttribute(
      'href', 'https://zoom.us/j/123'
    );
  });

  it('renders Join call button for http URL (non-TLS)', () => {
    renderCard({ videoCallLink: 'http://internal.company.com/meeting/42' });
    expect(screen.getByRole('link', { name: /join.*video call/i })).toBeInTheDocument();
  });

  it('does NOT render link when videoCallLink is undefined', () => {
    renderCard({ videoCallLink: undefined });
    expect(screen.queryByRole('link', { name: /join.*video call/i })).not.toBeInTheDocument();
  });

  it('does NOT render link when videoCallLink is null', () => {
    renderCard({ videoCallLink: null });
    expect(screen.queryByRole('link', { name: /join.*video call/i })).not.toBeInTheDocument();
  });

  it('does NOT render link when videoCallLink is empty string', () => {
    renderCard({ videoCallLink: '' });
    expect(screen.queryByRole('link', { name: /join.*video call/i })).not.toBeInTheDocument();
  });

  it('does NOT render link for javascript: URI', () => {
    renderCard({ videoCallLink: 'javascript:alert(1)' });
    expect(screen.queryByRole('link', { name: /join.*video call/i })).not.toBeInTheDocument();
  });

  it('does NOT render link for data: URI', () => {
    renderCard({ videoCallLink: 'data:text/html,<h1>XSS</h1>' });
    expect(screen.queryByRole('link', { name: /join.*video call/i })).not.toBeInTheDocument();
  });

  it('does NOT render link for ftp: URI', () => {
    renderCard({ videoCallLink: 'ftp://files.example.com/meeting' });
    expect(screen.queryByRole('link', { name: /join.*video call/i })).not.toBeInTheDocument();
  });

  it('handles very long URLs without crashing', () => {
    const longUrl = 'https://zoom.us/j/' + 'a'.repeat(5000);
    renderCard({ videoCallLink: longUrl });
    const link = screen.getByRole('link', { name: /join.*video call/i });
    expect(link).toHaveAttribute('href', longUrl);
  });

  it('handles URLs with special characters', () => {
    const url = 'https://zoom.us/j/123?pwd=abc%20def&token=<foo>';
    renderCard({ videoCallLink: url });
    expect(screen.getByRole('link', { name: /join.*video call/i })).toHaveAttribute('href', url);
  });

  it('opens link in new tab with security attributes', () => {
    renderCard({ videoCallLink: 'https://meet.google.com/abc-defg-hij' });
    const link = screen.getByRole('link', { name: /join.*video call/i });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
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
        type: 'Phone Interview',
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
    const interview = makeInterview({ videoCallLink: 'https://zoom.us/j/safe' });
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
            type: 'Phone Interview',
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
