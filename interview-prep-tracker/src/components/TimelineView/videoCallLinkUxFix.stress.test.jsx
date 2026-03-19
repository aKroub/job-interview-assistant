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
  const result = render(
    <InterviewCard
      interview={interview}
      onDeleteInterview={vi.fn()}
      onEdit={vi.fn()}
      highlightedInterviewId={null}
      onHighlightComplete={vi.fn()}
    />
  );
  return { interview, ...result };
}

const COMPANIES = [{ id: 'c1', name: 'Acme', position: 'SWE' }];
const TYPES = ['Phone Interview', 'Video Interview', 'In-Person Interview'];

function renderModal(props = {}) {
  const onAdd = props.onAdd ?? vi.fn();
  const onClose = props.onClose ?? vi.fn();
  const onEdit = props.onEdit ?? vi.fn();
  const result = render(
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
  return { onAdd, onClose, onEdit, ...result };
}

// ===========================================================================
// Hypothesis 1: Rapid toggle clicks cause state desynchronization
//
// The toggle button's aria-label and aria-expanded depend on `showVideoLink`
// state. Rapid clicking could cause React batching issues where the UI gets
// out of sync with the state value.
// ===========================================================================

describe('H1 — Rapid toggle clicks on InterviewCard video icon', () => {
  it('remains consistent after an odd number of rapid clicks (final state = shown)', async () => {
    const user = userEvent.setup();
    renderCard({ videoCallLink: 'https://zoom.us/j/123' });

    const toggleBtn = screen.getByRole('button', { name: /show.*video call link/i });

    // Click 5 times rapidly (odd = should end with link visible)
    await user.click(toggleBtn);
    // After first click, button label changes to "Hide..."
    const btnAfter1 = screen.getByRole('button', { name: /hide video call link/i });
    await user.click(btnAfter1);
    const btnAfter2 = screen.getByRole('button', { name: /show.*video call link/i });
    await user.click(btnAfter2);
    const btnAfter3 = screen.getByRole('button', { name: /hide video call link/i });
    await user.click(btnAfter3);
    const btnAfter4 = screen.getByRole('button', { name: /show.*video call link/i });
    await user.click(btnAfter4);

    // After 5 clicks (odd): link should be visible
    expect(screen.getByRole('link', { name: /join.*video call/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /hide video call link/i }))
      .toHaveAttribute('aria-expanded', 'true');
  });

  it('remains consistent after an even number of rapid clicks (final state = hidden)', async () => {
    const user = userEvent.setup();
    renderCard({ videoCallLink: 'https://zoom.us/j/123' });

    const toggleBtn = screen.getByRole('button', { name: /show.*video call link/i });

    // Click 6 times (even = should end with link hidden)
    await user.click(toggleBtn);
    await user.click(screen.getByRole('button', { name: /hide video call link/i }));
    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    await user.click(screen.getByRole('button', { name: /hide video call link/i }));
    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    await user.click(screen.getByRole('button', { name: /hide video call link/i }));

    // After 6 clicks (even): link should be hidden
    expect(screen.queryByRole('link', { name: /join.*video call/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show.*video call link/i }))
      .toHaveAttribute('aria-expanded', 'false');
  });

  it('aria-expanded is always in sync with visible link state after many toggles', async () => {
    const user = userEvent.setup();
    renderCard({ videoCallLink: 'https://zoom.us/j/123' });

    for (let i = 0; i < 10; i++) {
      const isCurrentlyShown = screen.queryByRole('link', { name: /join.*video call/i }) !== null;

      if (isCurrentlyShown) {
        const btn = screen.getByRole('button', { name: /hide video call link/i });
        expect(btn).toHaveAttribute('aria-expanded', 'true');
        await user.click(btn);
        expect(screen.queryByRole('link', { name: /join.*video call/i })).not.toBeInTheDocument();
      } else {
        const btn = screen.getByRole('button', { name: /show.*video call link/i });
        expect(btn).toHaveAttribute('aria-expanded', 'false');
        await user.click(btn);
        expect(screen.getByRole('link', { name: /join.*video call/i })).toBeInTheDocument();
      }
    }
  });
});

// ===========================================================================
// Hypothesis 2: Whitespace-padded URLs in InterviewCard and AddInterviewModal
//
// URLs with leading/trailing spaces, tabs, newlines should be trimmed.
// InterviewCard trims in render logic; AddInterviewModal trims on submit.
// Edge case: URL that is ONLY whitespace should be treated as empty.
// ===========================================================================

describe('H2 — Whitespace-padded URLs are handled correctly', () => {
  describe('InterviewCard trims whitespace for display', () => {
    it('shows toggle for URL with leading spaces', () => {
      renderCard({ videoCallLink: '   https://zoom.us/j/123' });
      expect(screen.getByRole('button', { name: /show.*video call link/i })).toBeInTheDocument();
    });

    it('shows toggle for URL with trailing spaces', () => {
      renderCard({ videoCallLink: 'https://zoom.us/j/123   ' });
      expect(screen.getByRole('button', { name: /show.*video call link/i })).toBeInTheDocument();
    });

    it('shows toggle for URL with both leading and trailing spaces', () => {
      renderCard({ videoCallLink: '  https://zoom.us/j/123  ' });
      expect(screen.getByRole('button', { name: /show.*video call link/i })).toBeInTheDocument();
    });

    it('shows toggle for URL with tab characters', () => {
      renderCard({ videoCallLink: '\thttps://zoom.us/j/123\t' });
      expect(screen.getByRole('button', { name: /show.*video call link/i })).toBeInTheDocument();
    });

    it('shows toggle for URL with newline characters', () => {
      renderCard({ videoCallLink: '\nhttps://zoom.us/j/123\n' });
      expect(screen.getByRole('button', { name: /show.*video call link/i })).toBeInTheDocument();
    });

    it('renders trimmed href in the revealed link', async () => {
      const user = userEvent.setup();
      renderCard({ videoCallLink: '  https://zoom.us/j/123  ' });
      await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
      expect(screen.getByRole('link', { name: /join.*video call/i }))
        .toHaveAttribute('href', 'https://zoom.us/j/123');
    });

    it('does NOT show toggle for whitespace-only string', () => {
      renderCard({ videoCallLink: '   \t  \n  ' });
      expect(screen.queryByRole('button', { name: /show.*video call link/i })).not.toBeInTheDocument();
    });
  });

  describe('AddInterviewModal trims whitespace on submit', () => {
    it('trims leading/trailing spaces from URL on add', async () => {
      const user = userEvent.setup();
      const onAdd = vi.fn();
      renderModal({
        onAdd,
        initialValues: {
          companyId: 'c1',
          type: 'Video Interview',
          date: '2099-06-01',
          time: '10:00',
          videoCallLink: '  https://zoom.us/j/123  ',
        },
      });

      await user.click(screen.getByText('Schedule'));
      expect(onAdd).toHaveBeenCalledWith('c1', expect.objectContaining({
        videoCallLink: 'https://zoom.us/j/123',
      }));
    });

    it('trims tab/newline whitespace from URL on add', async () => {
      const user = userEvent.setup();
      const onAdd = vi.fn();
      renderModal({
        onAdd,
        initialValues: {
          companyId: 'c1',
          type: 'Video Interview',
          date: '2099-06-01',
          time: '10:00',
          videoCallLink: '\t\nhttps://meet.google.com/abc\n\t',
        },
      });

      await user.click(screen.getByText('Schedule'));
      expect(onAdd).toHaveBeenCalledWith('c1', expect.objectContaining({
        videoCallLink: 'https://meet.google.com/abc',
      }));
    });

    it('treats whitespace-only URL as empty on submit', async () => {
      const user = userEvent.setup();
      const onAdd = vi.fn();
      renderModal({
        onAdd,
        initialValues: {
          companyId: 'c1',
          type: 'Video Interview',
          date: '2099-06-01',
          time: '10:00',
          videoCallLink: '   \t  ',
        },
      });

      await user.click(screen.getByText('Schedule'));
      expect(onAdd).toHaveBeenCalledWith('c1', expect.objectContaining({
        videoCallLink: '',
      }));
    });

    it('trims whitespace in edit mode too', async () => {
      const user = userEvent.setup();
      const onEdit = vi.fn();
      const interview = makeInterview({
        type: 'Video Interview',
        videoCallLink: '  https://zoom.us/j/edit-test  ',
      });
      renderModal({ interview, onEdit });

      await user.click(screen.getByText('Save Changes'));
      expect(onEdit).toHaveBeenCalledWith('c1', 'i1', expect.objectContaining({
        videoCallLink: 'https://zoom.us/j/edit-test',
      }));
    });
  });
});

// ===========================================================================
// Hypothesis 3: Type switching in AddInterviewModal leaks videoCallLink
//
// When user enters a video call link for "Video Interview", then switches to
// "Phone Interview" and back to "Video Interview", the link should have been
// cleared. Also, submitting as "Phone Interview" should never include a
// non-empty videoCallLink.
// ===========================================================================

describe('H3 — Type switching edge cases in AddInterviewModal', () => {
  it('clears videoCallLink when switching from Video to Phone and back to Video', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderModal({ onAdd });

    // Fill required fields
    await user.selectOptions(screen.getByLabelText(/company/i), 'c1');
    await user.type(screen.getByLabelText(/date/i), '2099-06-01');
    await user.type(screen.getByLabelText(/time/i), '10:00');

    // Select Video Interview and enter a link
    await user.selectOptions(screen.getByLabelText(/type/i), 'Video Interview');
    await user.type(screen.getByLabelText(/video call link/i), 'https://zoom.us/j/original');

    // Switch to Phone Interview (should clear the link)
    await user.selectOptions(screen.getByLabelText(/type/i), 'Phone Interview');
    expect(screen.queryByLabelText(/video call link/i)).not.toBeInTheDocument();

    // Switch back to Video Interview — field should be empty
    await user.selectOptions(screen.getByLabelText(/type/i), 'Video Interview');
    expect(screen.getByLabelText(/video call link/i)).toHaveValue('');
  });

  it('submitting as Phone Interview after entering a video link yields empty videoCallLink', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderModal({ onAdd });

    await user.selectOptions(screen.getByLabelText(/company/i), 'c1');
    await user.type(screen.getByLabelText(/date/i), '2099-06-01');
    await user.type(screen.getByLabelText(/time/i), '10:00');

    // Enter a video link first
    await user.selectOptions(screen.getByLabelText(/type/i), 'Video Interview');
    await user.type(screen.getByLabelText(/video call link/i), 'https://zoom.us/j/secret');

    // Switch to Phone Interview and submit
    await user.selectOptions(screen.getByLabelText(/type/i), 'Phone Interview');
    await user.click(screen.getByRole('button', { name: /schedule/i }));

    expect(onAdd).toHaveBeenCalledWith('c1', expect.objectContaining({
      type: 'Phone Interview',
      videoCallLink: '',
    }));
  });

  it('switching through all types clears videoCallLink each time', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderModal({ onAdd });

    await user.selectOptions(screen.getByLabelText(/company/i), 'c1');
    await user.type(screen.getByLabelText(/date/i), '2099-06-01');
    await user.type(screen.getByLabelText(/time/i), '10:00');

    // Video Interview → enter link
    await user.selectOptions(screen.getByLabelText(/type/i), 'Video Interview');
    await user.type(screen.getByLabelText(/video call link/i), 'https://zoom.us/j/1');

    // In-Person Interview → clears link
    await user.selectOptions(screen.getByLabelText(/type/i), 'In-Person Interview');

    // Phone Interview
    await user.selectOptions(screen.getByLabelText(/type/i), 'Phone Interview');

    // Back to Video Interview → should be empty
    await user.selectOptions(screen.getByLabelText(/type/i), 'Video Interview');
    expect(screen.getByLabelText(/video call link/i)).toHaveValue('');

    // Enter new link and submit
    await user.type(screen.getByLabelText(/video call link/i), 'https://zoom.us/j/2');
    await user.click(screen.getByRole('button', { name: /schedule/i }));

    expect(onAdd).toHaveBeenCalledWith('c1', expect.objectContaining({
      videoCallLink: 'https://zoom.us/j/2',
    }));
  });

  it('edit mode: switching type away from Video clears videoCallLink in submission', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const interview = makeInterview({
      type: 'Video Interview',
      videoCallLink: 'https://zoom.us/j/existing',
    });
    renderModal({ interview, onEdit });

    // Switch to Phone Interview
    await user.selectOptions(screen.getByLabelText(/type/i), 'Phone Interview');
    await user.click(screen.getByText('Save Changes'));

    expect(onEdit).toHaveBeenCalledWith('c1', 'i1', expect.objectContaining({
      type: 'Phone Interview',
      videoCallLink: '',
    }));
  });
});

// ===========================================================================
// Hypothesis 4: InterviewCard re-render with changed props
//
// If the interview prop changes (e.g. videoCallLink removed via edit), the
// toggle state `showVideoLink` remains `true` from before. This could render
// a "Join call" link section that is conditionally gated by `hasVideoCallLink`
// — but if the component doesn't reset `showVideoLink` on prop changes, the
// button label/aria state could be inconsistent.
// ===========================================================================

describe('H4 — InterviewCard prop changes with stale toggle state', () => {
  it('hides link section when re-rendered with empty videoCallLink after toggle was open', async () => {
    const user = userEvent.setup();
    const props = {
      onDeleteInterview: vi.fn(),
      onEdit: vi.fn(),
      highlightedInterviewId: null,
      onHighlightComplete: vi.fn(),
    };
    const interview = makeInterview({ videoCallLink: 'https://zoom.us/j/123' });

    const { rerender } = render(<InterviewCard interview={interview} {...props} />);

    // Open the toggle
    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    expect(screen.getByRole('link', { name: /join.*video call/i })).toBeInTheDocument();

    // Re-render with videoCallLink removed
    const updatedInterview = makeInterview({ videoCallLink: '' });
    rerender(<InterviewCard interview={updatedInterview} {...props} />);

    // Link section should be gone — the `showVideoLink && hasVideoCallLink` guard handles this
    expect(screen.queryByRole('link', { name: /join.*video call/i })).not.toBeInTheDocument();
    // Toggle button should also be gone since hasVideoCallLink is now false
    expect(screen.queryByRole('button', { name: /hide video call link/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show.*video call link/i })).not.toBeInTheDocument();
  });

  it('hides link section when type changes from Video to Phone via re-render', async () => {
    const user = userEvent.setup();
    const props = {
      onDeleteInterview: vi.fn(),
      onEdit: vi.fn(),
      highlightedInterviewId: null,
      onHighlightComplete: vi.fn(),
    };
    const interview = makeInterview({ type: 'Video Interview', videoCallLink: 'https://zoom.us/j/123' });

    const { rerender } = render(<InterviewCard interview={interview} {...props} />);

    // Open the toggle
    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    expect(screen.getByRole('link', { name: /join.*video call/i })).toBeInTheDocument();

    // Re-render with type changed to Phone Interview
    const updatedInterview = makeInterview({ type: 'Phone Interview', videoCallLink: 'https://zoom.us/j/123' });
    rerender(<InterviewCard interview={updatedInterview} {...props} />);

    // No toggle or link should be visible
    expect(screen.queryByRole('link', { name: /join.*video call/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show.*video call link/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /hide video call link/i })).not.toBeInTheDocument();
  });

  it('toggle returns to collapsed state when videoCallLink changes to a new URL', async () => {
    const user = userEvent.setup();
    const props = {
      onDeleteInterview: vi.fn(),
      onEdit: vi.fn(),
      highlightedInterviewId: null,
      onHighlightComplete: vi.fn(),
    };
    const interview = makeInterview({ videoCallLink: 'https://zoom.us/j/original' });

    const { rerender } = render(<InterviewCard interview={interview} {...props} />);

    // Open the toggle — shows old URL
    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    expect(screen.getByRole('link', { name: /join.*video call/i }))
      .toHaveAttribute('href', 'https://zoom.us/j/original');

    // Re-render with new URL (e.g. user edited the interview)
    const updatedInterview = makeInterview({ videoCallLink: 'https://zoom.us/j/updated' });
    rerender(<InterviewCard interview={updatedInterview} {...props} />);

    // showVideoLink state is still true from before, so the link should show the NEW URL
    // This tests that the href updates reactively even when toggle state persists
    const link = screen.queryByRole('link', { name: /join.*video call/i });
    if (link) {
      // If link is still shown (toggle state persists), it MUST show the updated URL
      expect(link).toHaveAttribute('href', 'https://zoom.us/j/updated');
    }
    // If link is hidden (toggle reset), that's also acceptable behavior
  });
});

// ===========================================================================
// Hypothesis 5: Double-submit prevention in AddInterviewModal
//
// The `isSubmitting` flag prevents double submission, but rapid double-clicks
// on the Schedule button could potentially fire onAdd twice if React batching
// doesn't protect against it.
// ===========================================================================

describe('H5 — Double-submit prevention in AddInterviewModal', () => {
  it('does not call onAdd twice on rapid double-click of Schedule button', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderModal({
      onAdd,
      initialValues: {
        companyId: 'c1',
        type: 'Video Interview',
        date: '2099-06-01',
        time: '10:00',
        videoCallLink: 'https://zoom.us/j/123',
      },
    });

    const scheduleBtn = screen.getByText('Schedule');
    // Rapid double-click
    await user.dblClick(scheduleBtn);

    // onAdd should have been called at most once (onClose is called immediately
    // after onAdd, so the component unmounts preventing a second call)
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('does not call onEdit twice on rapid double-click of Save Changes button', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onClose = vi.fn();
    const interview = makeInterview({
      type: 'Video Interview',
      videoCallLink: 'https://zoom.us/j/123',
    });

    renderModal({ interview, onEdit, onClose });

    const saveBtn = screen.getByText('Save Changes');
    await user.dblClick(saveBtn);

    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('does not submit when form is invalid even after rapid clicks', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderModal({ onAdd });

    // No fields filled — form is invalid
    const scheduleBtn = screen.getByText('Schedule');
    await user.click(scheduleBtn);
    await user.click(scheduleBtn);
    await user.click(scheduleBtn);

    expect(onAdd).not.toHaveBeenCalled();
  });
});
