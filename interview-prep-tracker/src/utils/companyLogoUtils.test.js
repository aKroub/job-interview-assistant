import { getCompanyLogoUrl, guessDomain, resolveCompanyLogoUrl } from './companyLogoUtils';
import { COMPANY_POOL } from '../constants/companies';

// ---------------------------------------------------------------------------
// getCompanyLogoUrl
// ---------------------------------------------------------------------------

describe('getCompanyLogoUrl', () => {
  it('returns static logo path for a known company (exact case)', () => {
    expect(getCompanyLogoUrl('Google')).toBe('/logos/google.png');
  });

  it('is case-insensitive', () => {
    expect(getCompanyLogoUrl('google')).toBe('/logos/google.png');
    expect(getCompanyLogoUrl('GOOGLE')).toBe('/logos/google.png');
    expect(getCompanyLogoUrl('GoOgLe')).toBe('/logos/google.png');
  });

  it('returns correct paths for every company in the pool', () => {
    for (const c of COMPANY_POOL) {
      expect(getCompanyLogoUrl(c.name)).toBe(`/logos/${c.slug}.png`);
    }
  });

  it('resolves aliases (Facebook → Meta)', () => {
    expect(getCompanyLogoUrl('Facebook')).toBe('/logos/meta.png');
    expect(getCompanyLogoUrl('facebook')).toBe('/logos/meta.png');
    expect(getCompanyLogoUrl('FACEBOOK')).toBe('/logos/meta.png');
  });

  it('returns null for an unknown company', () => {
    expect(getCompanyLogoUrl('Rippling')).toBeNull();
    expect(getCompanyLogoUrl('Some Startup')).toBeNull();
  });

  it('returns null for empty or falsy input', () => {
    expect(getCompanyLogoUrl('')).toBeNull();
    expect(getCompanyLogoUrl(null)).toBeNull();
    expect(getCompanyLogoUrl(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveCompanyLogoUrl
// ---------------------------------------------------------------------------

describe('resolveCompanyLogoUrl', () => {
  it('returns static pool logo when company name matches', () => {
    expect(resolveCompanyLogoUrl({ name: 'Google' })).toBe('/logos/google.png');
  });

  it('prefers static pool over customLogoUrl', () => {
    expect(resolveCompanyLogoUrl({ name: 'Google', customLogoUrl: 'data:image/png;base64,abc' }))
      .toBe('/logos/google.png');
  });

  it('prefers customLogoUrl over domain-based fetch', () => {
    const company = { name: 'Acme Corp', domain: 'acme.com', customLogoUrl: 'data:image/png;base64,abc' };
    expect(resolveCompanyLogoUrl(company)).toBe('data:image/png;base64,abc');
  });

  it('falls back to domain-based API URL when no pool match and no custom logo', () => {
    expect(resolveCompanyLogoUrl({ name: 'Acme Corp', domain: 'acme.com' }))
      .toBe('/api/logo?domain=acme.com');
  });

  it('encodes domain parameter in API URL', () => {
    expect(resolveCompanyLogoUrl({ name: 'Acme Corp', domain: 'acme&co.com' }))
      .toBe('/api/logo?domain=acme%26co.com');
  });

  it('returns null when no match, no custom logo, and no domain', () => {
    expect(resolveCompanyLogoUrl({ name: 'Acme Corp' })).toBeNull();
  });

  it('returns null for null/undefined input', () => {
    expect(resolveCompanyLogoUrl(null)).toBeNull();
    expect(resolveCompanyLogoUrl(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// guessDomain
// ---------------------------------------------------------------------------

describe('guessDomain', () => {
  it('lowercases and appends .com', () => {
    expect(guessDomain('Google')).toBe('google.com');
  });

  it('strips spaces', () => {
    expect(guessDomain('Check Point')).toBe('checkpoint.com');
  });

  it('strips special characters', () => {
    expect(guessDomain('McKinsey & Company')).toBe('mckinseycompany.com');
  });

  it('handles single-word names', () => {
    expect(guessDomain('Stripe')).toBe('stripe.com');
  });

  it('returns empty string for empty or falsy input', () => {
    expect(guessDomain('')).toBe('');
    expect(guessDomain(null)).toBe('');
    expect(guessDomain(undefined)).toBe('');
  });
});
