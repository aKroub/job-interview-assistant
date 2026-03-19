import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InterviewCard } from './InterviewCard';
import { DayColumn } from './DayColumn';

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

function renderCard(interviewOverrides = {}, handlers = {}) {
  const interview        = makeInterview(interviewOverrides);
  const onDeleteInterview = handlers.onDeleteInterview ?? vi.fn();
  const onEdit            = handlers.onEdit ?? vi.fn();
  const onUpdateInterview = handlers.onUpdateInterview ?? vi.fn();
  const result = render(
    <InterviewCard
      interview={interview}
      onDeleteInterview={onDeleteInterview}
      onEdit={onEdit}
      onUpdateInterview={onUpdateInterview}
      highlightedInterviewId={null}
      onHighlightComplete={vi.fn()}
    />
  );
  return { interview, onDeleteInterview, onEdit, onUpdateInterview, ...result };
}

// ===========================================================================
// Hypothesis 1: Rapid save/cancel cycling corrupts draft state
//
// Opening the panel populates linkDraft from the sanitized prop. Cancelling
// closes the panel without saving. If the user rapidly: opens → types → cancels
// → opens again, the draft should reset to the current prop value, not retain
// the previously typed (unsaved) text. Similarly, triggering save then
// immediately cancel (or vice versa) should not leave error state or stale
// draft visible on next open.
// ===========================================================================

describe('H1 — Rapid save/cancel cycling does not corrupt draft state', () => {
  it('reopening panel after cancel resets draft to current prop value', async () => {
    const user = userEvent.setup();
    renderCard({ videoCallLink: 'https://zoom.us/j/original' });

    // Open panel
    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    const input = screen.getByLabelText(/video call url/i);
    expect(input).toHaveValue('https://zoom.us/j/original');

    // Type a new URL but cancel
    await user.clear(input);
    await user.type(input, 'https://zoom.us/j/unsaved-draft');
    await user.click(screen.getByRole('button', { name: /cancel editing/i }));

    // Reopen panel — draft should be reset to prop value, not unsaved text
    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    expect(screen.getByLabelText(/video call url/i)).toHaveValue('https://zoom.us/j/original');
  });

  it('reopening panel after cancel clears any previous validation error', async () => {
    const user = userEvent.setup();
    renderCard({ videoCallLink: '' });

    // Open panel, type invalid URL, try to save → triggers error
    await user.click(screen.getByRole('button', { name: /add.*video call link/i }));
    await user.type(screen.getByLabelText(/video call url/i), 'not-a-url');
    await user.click(screen.getByRole('button', { name: /save video call link/i }));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Cancel
    await user.click(screen.getByRole('button', { name: /cancel editing/i }));

    // Reopen — error should not persist
    await user.click(screen.getByRole('button', { name: /add.*video call link/i }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('three open-type-cancel cycles leave no stale draft', async () => {
    const user = userEvent.setup();
    const { onUpdateInterview } = renderCard({ videoCallLink: 'https://zoom.us/j/stable' });

    for (let i = 0; i < 3; i++) {
      await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
      const input = screen.getByLabelText(/video call url/i);
      expect(input).toHaveValue('https://zoom.us/j/stable');
      await user.clear(input);
      await user.type(input, `https://zoom.us/j/attempt-${i}`);
      await user.click(screen.getByRole('button', { name: /cancel editing/i }));
    }

    // Never saved
    expect(onUpdateInterview).not.toHaveBeenCalled();
  });

  it('save immediately followed by reopen shows the saved value (not stale prop)', async () => {
    const user = userEvent.setup();
    const onUpdateInterview = vi.fn();
    const props = {
      onDeleteInterview: vi.fn(),
      onEdit: vi.fn(),
      onUpdateInterview,
      highlightedInterviewId: null,
      onHighlightComplete: vi.fn(),
    };
    const interview = makeInterview({ videoCallLink: 'https://zoom.us/j/old' });

    const { rerender } = render(<InterviewCard interview={interview} {...props} />);

    // Open, change URL, save
    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    const input = screen.getByLabelText(/video call url/i);
    await user.clear(input);
    await user.type(input, 'https://zoom.us/j/new');
    await user.click(screen.getByRole('button', { name: /save video call link/i }));

    expect(onUpdateInterview).toHaveBeenCalledWith('c1', 'i1', { videoCallLink: 'https://zoom.us/j/new' });

    // Simulate parent applying the update (re-render with new prop)
    const updated = makeInterview({ videoCallLink: 'https://zoom.us/j/new' });
    rerender(<InterviewCard interview={updated} {...props} />);

    // Reopen panel — should show the new saved value
    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    expect(screen.getByLabelText(/video call url/i)).toHaveValue('https://zoom.us/j/new');
  });
});

// ===========================================================================
// Hypothesis 2: Concurrent panel opens across multiple cards in DayColumn
//
// Multiple InterviewCards in the same DayColumn each have independent panel
// state. Opening a panel on card A, then opening on card B should result in
// both panels open simultaneously. Saving on one should call onUpdateInterview
// with the correct companyId/interviewId, not the other card's data.
// ===========================================================================

describe('H2 — Concurrent panel opens across multiple cards', () => {
  function renderDayWithTwoCards(handlers = {}) {
    const onDeleteInterview = handlers.onDeleteInterview ?? vi.fn();
    const onEdit            = handlers.onEdit ?? vi.fn();
    const onUpdateInterview = handlers.onUpdateInterview ?? vi.fn();

    const interviews = [
      makeInterview({
        id: 'i1', companyId: 'c1', companyName: 'Acme Corp',
        videoCallLink: 'https://zoom.us/j/acme', time: '09:00',
      }),
      makeInterview({
        id: 'i2', companyId: 'c2', companyName: 'Beta Inc',
        videoCallLink: 'https://zoom.us/j/beta', time: '11:00',
      }),
    ];

    render(
      <DayColumn
        date={new Date('2099-06-01')}
        interviews={interviews}
        isToday={false}
        isCollapsed={false}
        onDeleteInterview={onDeleteInterview}
        onEdit={onEdit}
        onUpdateInterview={onUpdateInterview}
        highlightedInterviewId={null}
        onHighlightComplete={vi.fn()}
      />
    );

    return { onUpdateInterview };
  }

  it('both panels can be open simultaneously', async () => {
    const user = userEvent.setup();
    renderDayWithTwoCards();

    const toggleButtons = screen.getAllByRole('button', { name: /show.*video call link/i });
    expect(toggleButtons).toHaveLength(2);

    // Open first card's panel
    await user.click(toggleButtons[0]);
    // Open second card's panel
    await user.click(screen.getAllByRole('button', { name: /show.*video call link/i })[0]);

    // Both "Join call" links should be visible
    const joinLinks = screen.getAllByRole('link', { name: /join.*video call/i });
    expect(joinLinks).toHaveLength(2);
  });

  it('saving on one card does not affect the other card', async () => {
    const user = userEvent.setup();
    const { onUpdateInterview } = renderDayWithTwoCards();

    // Open both panels
    const toggleButtons = screen.getAllByRole('button', { name: /show.*video call link/i });
    await user.click(toggleButtons[0]);
    await user.click(screen.getAllByRole('button', { name: /show.*video call link/i })[0]);

    // Modify the first card's URL and save
    const inputs = screen.getAllByLabelText(/video call url/i);
    await user.clear(inputs[0]);
    await user.type(inputs[0], 'https://zoom.us/j/acme-updated');
    const saveButtons = screen.getAllByRole('button', { name: /save video call link/i });
    await user.click(saveButtons[0]);

    // Should save with first card's IDs
    expect(onUpdateInterview).toHaveBeenCalledWith('c1', 'i1', { videoCallLink: 'https://zoom.us/j/acme-updated' });
    expect(onUpdateInterview).toHaveBeenCalledTimes(1);

    // Second card's panel should still be open with its original URL
    const remainingInput = screen.getByLabelText(/video call url/i);
    expect(remainingInput).toHaveValue('https://zoom.us/j/beta');
  });
});

// ===========================================================================
// Hypothesis 3: XSS through crafted URL input in InterviewCard inline panel
//
// The inline input on InterviewCard allows free-form typing. Although save
// sanitizes via sanitizeVideoCallUrl, we must verify:
// 1. No dangerous href reaches the DOM at any point
// 2. Typing a javascript: URI and pressing Enter does not bypass sanitization
// 3. The validation error blocks save and no href is set
// ===========================================================================

describe('H3 — XSS vectors never reach the DOM via inline panel', () => {
  const XSS_VECTORS = [
    'javascript:alert(document.cookie)',
    'javascript:void(0)',
    'JAVASCRIPT:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox("xss")',
    'blob:https://evil.com/uuid',
    'file:///etc/passwd',
    '  javascript:alert(1)  ',
    'jAvAsCrIpT:alert(1)',
  ];

  it.each(XSS_VECTORS)('blocks XSS vector from being saved: %s', async (xssUrl) => {
    const user = userEvent.setup();
    const { onUpdateInterview } = renderCard({ videoCallLink: '' });

    await user.click(screen.getByRole('button', { name: /add.*video call link/i }));
    const input = screen.getByLabelText(/video call url/i);
    await user.type(input, xssUrl);
    await user.click(screen.getByRole('button', { name: /save video call link/i }));

    // Validation error should appear
    expect(screen.getByRole('alert')).toBeInTheDocument();
    // onUpdateInterview should NOT have been called
    expect(onUpdateInterview).not.toHaveBeenCalled();
    // No <a> with dangerous href should exist
    const links = screen.queryAllByRole('link');
    for (const link of links) {
      expect(link.getAttribute('href')).not.toMatch(/^(javascript|data|vbscript|blob|file):/i);
    }
  });

  it.each(XSS_VECTORS)('blocks XSS vector via Enter key: %s', async (xssUrl) => {
    const user = userEvent.setup();
    const { onUpdateInterview } = renderCard({ videoCallLink: '' });

    await user.click(screen.getByRole('button', { name: /add.*video call link/i }));
    const input = screen.getByLabelText(/video call url/i);
    await user.type(input, xssUrl);
    await user.keyboard('{Enter}');

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(onUpdateInterview).not.toHaveBeenCalled();
  });

  it('previously stored XSS URI is never rendered as clickable href', async () => {
    const user = userEvent.setup();
    // Simulate a scenario where a dangerous URI somehow got stored
    renderCard({ videoCallLink: 'javascript:alert(1)' });

    // Should show "Add" toggle (sanitizer rejects it), not "Show"
    const addBtn = screen.getByRole('button', { name: /add.*video call link/i });
    await user.click(addBtn);

    // No Join call link should appear
    expect(screen.queryByRole('link', { name: /join.*video call/i })).not.toBeInTheDocument();
    // Input should be empty (sanitized to '')
    expect(screen.getByLabelText(/video call url/i)).toHaveValue('');
  });

  it('valid URL after XSS attempt saves correctly', async () => {
    const user = userEvent.setup();
    const { onUpdateInterview } = renderCard({ videoCallLink: '' });

    await user.click(screen.getByRole('button', { name: /add.*video call link/i }));
    const input = screen.getByLabelText(/video call url/i);

    // First attempt: XSS
    await user.type(input, 'javascript:alert(1)');
    await user.click(screen.getByRole('button', { name: /save video call link/i }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(onUpdateInterview).not.toHaveBeenCalled();

    // Clear and enter valid URL
    await user.clear(input);
    await user.type(input, 'https://zoom.us/j/safe');
    // Error should be cleared by onChange
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /save video call link/i }));

    expect(onUpdateInterview).toHaveBeenCalledWith('c1', 'i1', { videoCallLink: 'https://zoom.us/j/safe' });
  });
});

// ===========================================================================
// Hypothesis 4: Enter/Escape key handling edge cases
//
// The input has onKeyDown handlers: Enter → handleSaveLink, Escape →
// handleCancelLink. Edge cases:
// - Enter on empty input should save empty string (clear link), not show error
// - Enter on invalid URL should show error and keep panel open
// - Escape should always close panel regardless of draft/error state
// - Rapid Enter then Escape should not leave panel in broken state
// ===========================================================================

describe('H4 — Enter/Escape key handling edge cases', () => {
  it('Enter on empty input saves empty string (clears the link)', async () => {
    const user = userEvent.setup();
    const { onUpdateInterview } = renderCard({ videoCallLink: 'https://zoom.us/j/existing' });

    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    const input = screen.getByLabelText(/video call url/i);
    await user.clear(input);
    await user.keyboard('{Enter}');

    expect(onUpdateInterview).toHaveBeenCalledWith('c1', 'i1', { videoCallLink: '' });
  });

  it('Enter on invalid URL shows error and keeps panel open', async () => {
    const user = userEvent.setup();
    const { onUpdateInterview } = renderCard({ videoCallLink: '' });

    await user.click(screen.getByRole('button', { name: /add.*video call link/i }));
    await user.type(screen.getByLabelText(/video call url/i), 'not-valid');
    await user.keyboard('{Enter}');

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(onUpdateInterview).not.toHaveBeenCalled();
    // Panel should still be open
    expect(screen.getByLabelText(/video call url/i)).toBeInTheDocument();
  });

  it('Escape closes panel even when validation error is showing', async () => {
    const user = userEvent.setup();
    renderCard({ videoCallLink: '' });

    await user.click(screen.getByRole('button', { name: /add.*video call link/i }));
    await user.type(screen.getByLabelText(/video call url/i), 'bad-url');
    await user.keyboard('{Enter}');
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Escape should close panel
    await user.keyboard('{Escape}');
    expect(screen.queryByLabelText(/video call url/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('Enter on valid URL saves and closes panel', async () => {
    const user = userEvent.setup();
    const { onUpdateInterview } = renderCard({ videoCallLink: '' });

    await user.click(screen.getByRole('button', { name: /add.*video call link/i }));
    await user.type(screen.getByLabelText(/video call url/i), 'https://zoom.us/j/enter-save');
    await user.keyboard('{Enter}');

    expect(onUpdateInterview).toHaveBeenCalledWith('c1', 'i1', { videoCallLink: 'https://zoom.us/j/enter-save' });
    // Panel should be closed after save
    expect(screen.queryByLabelText(/video call url/i)).not.toBeInTheDocument();
  });

  it('multiple Enter presses on invalid input do not call save multiple times', async () => {
    const user = userEvent.setup();
    const { onUpdateInterview } = renderCard({ videoCallLink: '' });

    await user.click(screen.getByRole('button', { name: /add.*video call link/i }));
    await user.type(screen.getByLabelText(/video call url/i), 'ftp://invalid');
    await user.keyboard('{Enter}');
    await user.keyboard('{Enter}');
    await user.keyboard('{Enter}');

    expect(onUpdateInterview).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

// ===========================================================================
// Hypothesis 5: linkDraft not reset when panel reopened after external prop change
//
// Scenario: User opens panel → sees draft = prop value → closes (cancel).
// Parent updates videoCallLink prop (e.g. via edit modal). User reopens panel.
// The draft should reflect the NEW prop value, not the old one from before the
// prop change. This tests that handleToggleVideoPanel reads the current
// `trimmedVideoLink` on each open, not a stale closure.
// ===========================================================================

describe('H5 — linkDraft syncs with external prop changes between panel sessions', () => {
  it('draft reflects updated prop value when panel is reopened after prop change', async () => {
    const user = userEvent.setup();
    const props = {
      onDeleteInterview: vi.fn(),
      onEdit: vi.fn(),
      onUpdateInterview: vi.fn(),
      highlightedInterviewId: null,
      onHighlightComplete: vi.fn(),
    };
    const interview = makeInterview({ videoCallLink: 'https://zoom.us/j/v1' });

    const { rerender } = render(<InterviewCard interview={interview} {...props} />);

    // Open panel, verify draft
    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    expect(screen.getByLabelText(/video call url/i)).toHaveValue('https://zoom.us/j/v1');

    // Close panel
    await user.click(screen.getByRole('button', { name: /cancel editing/i }));

    // Parent updates the videoCallLink prop
    const updated = makeInterview({ videoCallLink: 'https://zoom.us/j/v2' });
    rerender(<InterviewCard interview={updated} {...props} />);

    // Reopen panel — draft should show the new prop value
    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    expect(screen.getByLabelText(/video call url/i)).toHaveValue('https://zoom.us/j/v2');
  });

  it('draft reflects prop cleared to empty when panel is reopened', async () => {
    const user = userEvent.setup();
    const props = {
      onDeleteInterview: vi.fn(),
      onEdit: vi.fn(),
      onUpdateInterview: vi.fn(),
      highlightedInterviewId: null,
      onHighlightComplete: vi.fn(),
    };
    const interview = makeInterview({ videoCallLink: 'https://zoom.us/j/will-be-cleared' });

    const { rerender } = render(<InterviewCard interview={interview} {...props} />);

    // Open and close panel
    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    expect(screen.getByLabelText(/video call url/i)).toHaveValue('https://zoom.us/j/will-be-cleared');
    await user.click(screen.getByRole('button', { name: /cancel editing/i }));

    // Parent clears the videoCallLink
    const updated = makeInterview({ videoCallLink: '' });
    rerender(<InterviewCard interview={updated} {...props} />);

    // Reopen panel — draft should be empty
    await user.click(screen.getByRole('button', { name: /add.*video call link/i }));
    expect(screen.getByLabelText(/video call url/i)).toHaveValue('');
  });

  it('draft reflects prop changing from empty to populated', async () => {
    const user = userEvent.setup();
    const props = {
      onDeleteInterview: vi.fn(),
      onEdit: vi.fn(),
      onUpdateInterview: vi.fn(),
      highlightedInterviewId: null,
      onHighlightComplete: vi.fn(),
    };
    const interview = makeInterview({ videoCallLink: '' });

    const { rerender } = render(<InterviewCard interview={interview} {...props} />);

    // Open and close empty panel
    await user.click(screen.getByRole('button', { name: /add.*video call link/i }));
    expect(screen.getByLabelText(/video call url/i)).toHaveValue('');
    await user.click(screen.getByRole('button', { name: /cancel editing/i }));

    // Parent sets a videoCallLink (e.g. from a suggestion)
    const updated = makeInterview({ videoCallLink: 'https://meet.google.com/new-meeting' });
    rerender(<InterviewCard interview={updated} {...props} />);

    // Reopen panel — draft should show the new value
    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    expect(screen.getByLabelText(/video call url/i)).toHaveValue('https://meet.google.com/new-meeting');
  });

  it('multiple prop changes between opens always show latest value', async () => {
    const user = userEvent.setup();
    const props = {
      onDeleteInterview: vi.fn(),
      onEdit: vi.fn(),
      onUpdateInterview: vi.fn(),
      highlightedInterviewId: null,
      onHighlightComplete: vi.fn(),
    };

    const urls = [
      'https://zoom.us/j/1',
      'https://zoom.us/j/2',
      'https://zoom.us/j/3',
      'https://zoom.us/j/4',
    ];

    let interview = makeInterview({ videoCallLink: urls[0] });
    const { rerender } = render(<InterviewCard interview={interview} {...props} />);

    for (let i = 1; i < urls.length; i++) {
      // Rerender with next URL (without opening panel)
      interview = makeInterview({ videoCallLink: urls[i] });
      rerender(<InterviewCard interview={interview} {...props} />);
    }

    // Open panel after all prop changes — should show the latest URL
    await user.click(screen.getByRole('button', { name: /show.*video call link/i }));
    expect(screen.getByLabelText(/video call url/i)).toHaveValue(urls[urls.length - 1]);
  });
});
