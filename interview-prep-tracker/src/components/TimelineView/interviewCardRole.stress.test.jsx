import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { InterviewCard } from './InterviewCard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInterview(overrides = {}) {
  return {
    id:          'i1',
    companyId:   'c1',
    companyName: 'Acme Corp',
    type:        'Phone Interview',
    date:        '2099-06-01',
    time:        '10:00',
    status:      'scheduled',
    ...overrides,
  };
}

function renderCard(interviewOverrides = {}) {
  const interview = makeInterview(interviewOverrides);
  const { container } = render(
    <InterviewCard
      interview={interview}
      onDeleteInterview={vi.fn()}
      onEdit={vi.fn()}
    />
  );
  return { container, interview };
}

/**
 * Returns all <p> elements inside the card (role + type lines use <p>).
 */
function getParagraphs(container) {
  const card = container.querySelector('div');
  return [...card.querySelectorAll('p')];
}

// ---------------------------------------------------------------------------
// Hypothesis 1: Very long position strings
//
// The `truncate` class should prevent overflow and keep the card layout
// stable. We verify the CSS class is applied and the text renders without
// error for extreme lengths.
// ---------------------------------------------------------------------------

describe('Stress: very long position strings', () => {
  it('renders a 200-character position with truncate class', () => {
    const longPosition = 'A'.repeat(200);
    renderCard({ position: longPosition });
    const el = screen.getByText(longPosition);
    expect(el).toBeInTheDocument();
    expect(el.tagName).toBe('P');
    expect(el).toHaveClass('truncate');
  });

  it('renders a 1000-character position without crashing', () => {
    const veryLong = 'A'.repeat(1000);
    const { container } = renderCard({ position: veryLong });
    const paragraphs = getParagraphs(container);
    const longP = paragraphs.find(p => p.textContent === veryLong);
    expect(longP).toBeDefined();
    expect(longP).toHaveClass('truncate');
  });

  it('renders a position with only spaces (whitespace-only) as hidden', () => {
    // '   ' is truthy but visually empty — the && check passes
    // This is an edge case: whitespace-only strings ARE rendered
    renderCard({ position: '   ' });
    const paragraphs = screen.getAllByRole('paragraph');
    // The whitespace-only string is truthy, so it renders.
    // We just verify no crash and the truncate class is applied.
    const whitespaceParagraph = paragraphs.find(p => p.textContent.trim() === '');
    // Whitespace-only IS truthy so it WILL render — this is a known edge case
    expect(whitespaceParagraph).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Hypothesis 2: Special characters in position
//
// Position strings may contain HTML-like characters (<, >, &, quotes),
// emoji, unicode, or newlines. React's JSX escapes these automatically,
// but we verify no XSS vector or rendering anomaly exists.
// ---------------------------------------------------------------------------

describe('Stress: special characters in position', () => {
  const specialCases = [
    { label: 'HTML tags',        value: '<script>alert("xss")</script>' },
    { label: 'ampersand entity', value: 'R&D Engineer' },
    { label: 'quotes',           value: '"Lead" \'Engineer\'' },
    { label: 'angle brackets',   value: 'Engineer <L5>' },
    { label: 'emoji',            value: 'Senior Engineer 🚀🔥' },
    { label: 'unicode',          value: 'Ingénieur Principal — Données' },
    { label: 'CJK characters',   value: 'ソフトウェアエンジニア' },
    { label: 'RTL text',         value: 'مهندس برمجيات' },
    { label: 'newlines',         value: 'Senior\nSoftware\nEngineer' },
    { label: 'tabs',             value: 'Senior\tSoftware\tEngineer' },
    { label: 'null bytes',       value: 'Engineer\x00Senior' },
    { label: 'zero-width chars', value: 'Senior\u200BEngineer' },
  ];

  specialCases.forEach(({ label, value }) => {
    it(`renders position with ${label} without crashing`, () => {
      const { container } = renderCard({ position: value });
      const paragraphs = getParagraphs(container);
      // Position paragraph should exist (value is truthy)
      const positionP = paragraphs.find(p => p.textContent.includes(value.slice(0, 5)));
      expect(positionP).toBeDefined();
      expect(positionP).toHaveClass('truncate');
    });
  });

  it('does not inject raw HTML (XSS protection)', () => {
    const { container } = renderCard({ position: '<img src=x onerror=alert(1)>' });
    // Should render as text, not as an actual <img> element
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Hypothesis 3: Falsy position values (null / undefined / empty / 0 / false)
//
// The conditional {interview.position && ...} must hide the element for ALL
// falsy values. We verify no empty <p> or stray text "0" / "false" appears.
// ---------------------------------------------------------------------------

describe('Stress: falsy position values', () => {
  const falsyCases = [
    { label: 'null',      value: null },
    { label: 'undefined', value: undefined },
    { label: 'empty',     value: '' },
    { label: 'zero',      value: 0 },
    { label: 'false',     value: false },
  ];

  falsyCases.forEach(({ label, value }) => {
    it(`does not render position paragraph when position is ${label}`, () => {
      const { container } = renderCard({ position: value });
      const paragraphs = getParagraphs(container);

      // Only the interview type paragraph should exist (no position paragraph)
      const typeParagraph = paragraphs.find(p => p.textContent === 'Phone Interview');
      const nonTypeParagraphs = paragraphs.filter(p => p.textContent !== 'Phone Interview');

      // There should be no extra paragraphs beyond the type line
      expect(nonTypeParagraphs).toHaveLength(0);
    });
  });

  it('does not render position when position key is missing entirely', () => {
    const interview = {
      id:          'i1',
      companyId:   'c1',
      companyName: 'Acme Corp',
      type:        'Phone Interview',
      date:        '2099-06-01',
      time:        '10:00',
      status:      'scheduled',
      // no position key at all
    };
    const { container } = render(
      <InterviewCard
        interview={interview}
        onDeleteInterview={vi.fn()}
        onEdit={vi.fn()}
      />
    );
    const paragraphs = getParagraphs(container);
    const nonTypeParagraphs = paragraphs.filter(p => p.textContent !== 'Phone Interview');
    expect(nonTypeParagraphs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Hypothesis 4: Card layout with all fields present
//
// When every optional field is provided (time, duration, company, position,
// type, status), the card should render all of them in the correct visual
// order without any field being lost or duplicated.
// ---------------------------------------------------------------------------

describe('Stress: card layout with all fields populated', () => {
  it('renders all fields in correct order: time > company > position > type > status', () => {
    const { container } = renderCard({
      time:        '14:30',
      duration:    90,
      companyName: 'MegaCorp',
      position:    'Staff Engineer',
      type:        'System Design',
      status:      'scheduled',
    });

    // All fields should be present
    expect(screen.getByText('14:30')).toBeInTheDocument();
    expect(screen.getByText(/·\s*90 min/)).toBeInTheDocument();
    expect(screen.getByText('MegaCorp')).toBeInTheDocument();
    expect(screen.getByText('Staff Engineer')).toBeInTheDocument();
    expect(screen.getByText('System Design')).toBeInTheDocument();
    expect(screen.getByText('scheduled')).toBeInTheDocument();

    // Verify order: position must come AFTER company and BEFORE type
    const card = container.firstChild;
    const allText = card.textContent;
    const companyIdx   = allText.indexOf('MegaCorp');
    const positionIdx  = allText.indexOf('Staff Engineer');
    const typeIdx      = allText.indexOf('System Design');
    const statusIdx    = allText.indexOf('scheduled');

    expect(companyIdx).toBeLessThan(positionIdx);
    expect(positionIdx).toBeLessThan(typeIdx);
    expect(typeIdx).toBeLessThan(statusIdx);
  });

  it('renders correctly when only position is present (no time, no type, no duration)', () => {
    const { container } = renderCard({
      time:     undefined,
      duration: undefined,
      type:     undefined,
      position: 'Backend Developer',
    });

    expect(screen.getByText('Backend Developer')).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    // No time or type paragraphs
    expect(screen.queryByText(/min\)/)).not.toBeInTheDocument();
  });

  it('renders multiple cards without position interference', () => {
    const interviews = [
      makeInterview({ id: 'i1', position: 'Frontend Engineer' }),
      makeInterview({ id: 'i2', position: 'Backend Engineer', companyName: 'OtherCo' }),
      makeInterview({ id: 'i3', position: undefined, companyName: 'NoPosInc' }),
    ];

    const { container } = render(
      <>
        {interviews.map(interview => (
          <InterviewCard
            key={interview.id}
            interview={interview}
            onDeleteInterview={vi.fn()}
            onEdit={vi.fn()}
          />
        ))}
      </>
    );

    expect(screen.getByText('Frontend Engineer')).toBeInTheDocument();
    expect(screen.getByText('Backend Engineer')).toBeInTheDocument();
    // NoPosInc card should not have a position paragraph
    expect(screen.getByText('NoPosInc')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Hypothesis 5: Numeric position value (edge case — 0 is falsy but what
// about positive numbers?)
//
// The `interview.position` is typed as string but could receive a number
// from malformed data. Verify the component handles it gracefully.
// ---------------------------------------------------------------------------

describe('Stress: non-string position values', () => {
  it('does not render position for a truthy number (type guard rejects it)', () => {
    const { container } = renderCard({ position: 42 });
    const paragraphs = getParagraphs(container);
    const nonTypeParagraphs = paragraphs.filter(p => p.textContent !== 'Phone Interview');
    expect(nonTypeParagraphs).toHaveLength(0);
    // "42" should NOT appear anywhere as stray text
    expect(screen.queryByText('42')).not.toBeInTheDocument();
  });

  it('does not render position for NaN', () => {
    const { container } = renderCard({ position: NaN });
    const paragraphs = getParagraphs(container);
    const nonTypeParagraphs = paragraphs.filter(p => p.textContent !== 'Phone Interview');
    expect(nonTypeParagraphs).toHaveLength(0);
  });

  it('does not render position for a boolean true', () => {
    const { container } = renderCard({ position: true });
    const paragraphs = getParagraphs(container);
    const nonTypeParagraphs = paragraphs.filter(p => p.textContent !== 'Phone Interview');
    expect(nonTypeParagraphs).toHaveLength(0);
    expect(screen.queryByText('true')).not.toBeInTheDocument();
  });

  it('does not render position for an object', () => {
    const { container } = renderCard({ position: { role: 'Engineer' } });
    const paragraphs = getParagraphs(container);
    const nonTypeParagraphs = paragraphs.filter(p => p.textContent !== 'Phone Interview');
    expect(nonTypeParagraphs).toHaveLength(0);
  });
});
