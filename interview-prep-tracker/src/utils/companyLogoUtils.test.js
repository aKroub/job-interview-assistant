import { getCompanyLogoUrl, guessDomain } from './companyLogoUtils';
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

  it('returns correct paths for all pool companies with logos', () => {
    const companiesWithLogos = COMPANY_POOL.filter((c) => c.hasLogo !== false);

    for (const c of companiesWithLogos) {
      expect(getCompanyLogoUrl(c.name)).toBe(`/logos/${c.slug}.png`);
    }
  });

  it('returns null for pool companies with hasLogo: false', () => {
    const companiesWithoutLogos = COMPANY_POOL.filter((c) => c.hasLogo === false);
    expect(companiesWithoutLogos.length).toBeGreaterThan(0);

    for (const c of companiesWithoutLogos) {
      expect(getCompanyLogoUrl(c.name)).toBeNull();
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
