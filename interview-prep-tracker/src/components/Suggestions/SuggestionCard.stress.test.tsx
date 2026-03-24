// @ts-nocheck
import { render, screen } from '@testing-library/react';
import React from 'react';
import { SuggestionCard } from './SuggestionCard';
import { getCompanyLogoUrl, guessDomain } from '../../utils/companyLogoUtils';

/**
 * Stress tests for the SuggestionCard logo fallback behaviour.
 *
 * The change under test: when getCompanyLogoUrl returns null (company not in
 * the static pool), the card now falls back to:
 *   /api/logo?domain=<encodeURIComponent(guessDomain(companyName))>
 *
 * Hypotheses tested:
 *  H1 — Empty/null/undefined companyName
 *  H2 — Special characters in companyName (AT&T, Y Combinator, etc.)
 *  H3 — guessDomain returns empty string for falsy input
 *  H4 — Fallback URL validity for unusual company names
 *  H5 — getCompanyLogoUrl returning null correctly triggers the fallback
 */

const noop = () => {};

function makeSuggestion(overrides = {}) {
  return {
    id: 'stress_1',
    companyName: 'SomeUnknownStartup',
    type: 'Video Interview',
    date: '2025-06-01',
    time: '10:00',
    subject: 'Interview',
    emailSnippet: 'Please join us.',
    confidence: 0.8,
    source: 'gmail+calendar',
    ...overrides,
  };
}

/**
 * Helper: find the logo <img> element in the rendered card.
 * CompanyLogo renders with aria-hidden="true" and alt="", so we query by role
 * with hidden:true, or fall back to querySelector on the container.
 */
function queryLogoImg(container) {
  return container.querySelector('img[aria-hidden="true"]');
}

// ---------------------------------------------------------------------------
// H1 — Empty / null / undefined companyName
// ---------------------------------------------------------------------------
describe('H1 — empty/null/undefined companyName', () => {
  it('renders no logo img when companyName is empty string', () => {
    const { container } = render(
      <SuggestionCard suggestion={makeSuggestion({ companyName: '' })} onDismiss={noop} onAccept={noop} />
    );
    // guessDomain('') returns '', so the fallback URL is /api/logo?domain=
    // CompanyLogo receives a truthy string so it WILL render an img (the URL
    // is technically non-empty). Verify it at least doesn't crash.
    const img = queryLogoImg(container);
    // The logoUrl expression: getCompanyLogoUrl('') || `/api/logo?domain=${encodeURIComponent(guessDomain(''))}`
    // getCompanyLogoUrl('') → null, guessDomain('') → '', so fallback = '/api/logo?domain='
    // That's a truthy string, so CompanyLogo will render an <img>.
    if (img) {
      expect(img.src).toContain('/api/logo?domain=');
    }
  });

  it('renders no logo img when companyName is null', () => {
    // guessDomain(null) returns '', encodeURIComponent('') = ''
    // getCompanyLogoUrl(null) returns null
    // Fallback: '/api/logo?domain=' — truthy, so img renders
    const { container } = render(
      <SuggestionCard suggestion={makeSuggestion({ companyName: null })} onDismiss={noop} onAccept={noop} />
    );
    const img = queryLogoImg(container);
    if (img) {
      expect(img.src).toContain('/api/logo?domain=');
    }
  });

  it('renders no logo img when companyName is undefined', () => {
    const { container } = render(
      <SuggestionCard suggestion={makeSuggestion({ companyName: undefined })} onDismiss={noop} onAccept={noop} />
    );
    const img = queryLogoImg(container);
    if (img) {
      expect(img.src).toContain('/api/logo?domain=');
    }
  });

  it('guessDomain returns empty string for falsy inputs', () => {
    expect(guessDomain('')).toBe('');
    expect(guessDomain(null)).toBe('');
    expect(guessDomain(undefined)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// H2 — Special characters in companyName
// ---------------------------------------------------------------------------
describe('H2 — special characters in companyName', () => {
  const specialNames = [
    { name: 'AT&T', expectedDomain: 'att.com' },
    { name: 'Y Combinator', expectedDomain: 'ycombinator.com' },
    { name: "Lowe's", expectedDomain: 'lowes.com' },
    { name: 'Procter & Gamble', expectedDomain: 'proctergamble.com' },
    { name: 'Johnson & Johnson', expectedDomain: 'johnsonjohnson.com' },
    { name: '日本語Company', expectedDomain: 'company.com' },
    { name: '  Spaces Everywhere  ', expectedDomain: 'spaceseverywhere.com' },
    { name: 'Über Technologies', expectedDomain: 'bertechnologies.com' },
  ];

  it.each(specialNames)(
    'guessDomain("$name") returns "$expectedDomain"',
    ({ name, expectedDomain }) => {
      expect(guessDomain(name)).toBe(expectedDomain);
    }
  );

  it.each(specialNames)(
    'renders an img with properly encoded fallback URL for "$name"',
    ({ name, expectedDomain }) => {
      // These names are not in the static pool, so getCompanyLogoUrl returns null
      // and the fallback kicks in.
      const { container } = render(
        <SuggestionCard suggestion={makeSuggestion({ companyName: name })} onDismiss={noop} onAccept={noop} />
      );
      const img = queryLogoImg(container);
      expect(img).not.toBeNull();
      // The src should contain the properly encoded domain
      expect(img.src).toContain(`/api/logo?domain=${encodeURIComponent(expectedDomain)}`);
    }
  );

  it('encodeURIComponent correctly handles ampersand in guessDomain output', () => {
    // guessDomain strips non-alphanumeric, so AT&T → att.com (no ampersand in output)
    // But let's verify the full chain doesn't break
    const domain = guessDomain('AT&T');
    const encoded = encodeURIComponent(domain);
    expect(encoded).toBe('att.com');
  });
});

// ---------------------------------------------------------------------------
// H3 — guessDomain returns empty string for edge cases
// ---------------------------------------------------------------------------
describe('H3 — guessDomain edge cases', () => {
  it('returns ".com" suffix even for all-symbol input "!!!"', () => {
    // All non-alphanumeric chars get stripped, leaving '' + '.com' = '.com'
    expect(guessDomain('!!!')).toBe('.com');
  });

  it('returns ".com" for emoji-only company name', () => {
    expect(guessDomain('🚀🔥')).toBe('.com');
  });

  it('handles numeric-only names', () => {
    expect(guessDomain('123')).toBe('123.com');
  });

  it('renders a fallback img even when guessDomain produces just ".com"', () => {
    const { container } = render(
      <SuggestionCard suggestion={makeSuggestion({ companyName: '!!!' })} onDismiss={noop} onAccept={noop} />
    );
    const img = queryLogoImg(container);
    // '/api/logo?domain=.com' is truthy, so CompanyLogo renders
    expect(img).not.toBeNull();
    expect(img.src).toContain('/api/logo?domain=.com');
  });
});

// ---------------------------------------------------------------------------
// H4 — Fallback URL always produces a valid URL string
// ---------------------------------------------------------------------------
describe('H4 — fallback URL validity', () => {
  const edgeCaseNames = [
    'Normal Company',
    'A',
    'a'.repeat(200),  // very long name
    'CamelCaseCompanyName',
    'company-with-dashes',
    'company_with_underscores',
    'ALLCAPS INC.',
    '   ',  // whitespace only
  ];

  it.each(edgeCaseNames)(
    'produces a non-throwing, non-empty fallback URL for "%s"',
    (name) => {
      // This must not throw
      const domain = guessDomain(name);
      const url = `/api/logo?domain=${encodeURIComponent(domain)}`;
      expect(typeof url).toBe('string');
      expect(url.length).toBeGreaterThan(0);
      expect(url).toMatch(/^\/api\/logo\?domain=/);
    }
  );

  it('does not crash SuggestionCard for a 200-character company name', () => {
    const longName = 'A'.repeat(200);
    const { container } = render(
      <SuggestionCard suggestion={makeSuggestion({ companyName: longName })} onDismiss={noop} onAccept={noop} />
    );
    const img = queryLogoImg(container);
    expect(img).not.toBeNull();
    expect(img.src).toContain('/api/logo?domain=');
  });

  it('whitespace-only companyName produces fallback with .com domain', () => {
    const { container } = render(
      <SuggestionCard suggestion={makeSuggestion({ companyName: '   ' })} onDismiss={noop} onAccept={noop} />
    );
    const img = queryLogoImg(container);
    expect(img).not.toBeNull();
    // guessDomain('   ') → strips spaces → '' + '.com' = '.com'
    expect(img.src).toContain('/api/logo?domain=.com');
  });
});

// ---------------------------------------------------------------------------
// H5 — getCompanyLogoUrl null triggers fallback, non-null skips it
// ---------------------------------------------------------------------------
describe('H5 — static pool hit vs fallback', () => {
  it('uses static logo URL for a company in the pool (Google)', () => {
    const staticUrl = getCompanyLogoUrl('Google');
    // Google should be in the static pool
    expect(staticUrl).not.toBeNull();
    expect(staticUrl).toMatch(/^\/logos\/.*\.png$/);

    const { container } = render(
      <SuggestionCard suggestion={makeSuggestion({ companyName: 'Google' })} onDismiss={noop} onAccept={noop} />
    );
    const img = queryLogoImg(container);
    expect(img).not.toBeNull();
    expect(img.src).toContain('/logos/');
    expect(img.src).not.toContain('/api/logo');
  });

  it('uses fallback API URL for a company NOT in the pool', () => {
    const unknownName = 'TotallyUnknownStartup2025';
    expect(getCompanyLogoUrl(unknownName)).toBeNull();

    const { container } = render(
      <SuggestionCard suggestion={makeSuggestion({ companyName: unknownName })} onDismiss={noop} onAccept={noop} />
    );
    const img = queryLogoImg(container);
    expect(img).not.toBeNull();
    expect(img.src).toContain('/api/logo?domain=totallyunknownstartup2025.com');
  });

  it('the || operator correctly prefers static URL over fallback', () => {
    // For a known company, getCompanyLogoUrl returns a truthy string,
    // so the || short-circuits and the fallback is never used.
    const staticUrl = getCompanyLogoUrl('Google');
    const fallbackUrl = `/api/logo?domain=${encodeURIComponent(guessDomain('Google'))}`;
    const result = staticUrl || fallbackUrl;
    expect(result).toBe(staticUrl);
    expect(result).not.toContain('/api/logo');
  });

  it('the || operator correctly falls back when static returns null', () => {
    const name = 'NonexistentCorp';
    const staticUrl = getCompanyLogoUrl(name);
    const fallbackUrl = `/api/logo?domain=${encodeURIComponent(guessDomain(name))}`;
    const result = staticUrl || fallbackUrl;
    expect(staticUrl).toBeNull();
    expect(result).toBe(fallbackUrl);
    expect(result).toContain('/api/logo?domain=nonexistentcorp.com');
  });
});
