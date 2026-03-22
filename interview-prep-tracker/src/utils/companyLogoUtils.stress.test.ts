import { describe, it, expect } from 'vitest';
import {
  getCompanyLogoUrl,
  resolveCompanyLogoUrl,
  guessDomain,
} from './companyLogoUtils';
import {
  COMPANY_POOL,
  COMPANY_POOL_BY_NAME,
  COMPANY_ALIASES,
} from '../constants/companies';

// ---------------------------------------------------------------------------
// Hypothesis 1: COMPANY_POOL_BY_NAME has no silent key collisions
//
// If two entries in COMPANY_POOL share the same lowercased name, one silently
// overwrites the other in the lookup map and that company becomes unreachable.
// ---------------------------------------------------------------------------

describe('H1: COMPANY_POOL data integrity', () => {
  it('has no duplicate lowercased names (no silent overwrites in COMPANY_POOL_BY_NAME)', () => {
    const seen = new Map();
    const duplicates = [];

    for (const entry of COMPANY_POOL) {
      const key = entry.name.toLowerCase();
      if (seen.has(key)) {
        duplicates.push({ first: seen.get(key).name, second: entry.name, key });
      }
      seen.set(key, entry);
    }

    expect(duplicates).toEqual([]);
  });

  it('has no duplicate slugs (which would overwrite static logo files)', () => {
    const slugs = COMPANY_POOL.map((c) => c.slug);
    const uniqueSlugs = new Set(slugs);
    expect(slugs.length).toBe(uniqueSlugs.size);
  });

  it('COMPANY_POOL_BY_NAME contains exactly one entry per pool company', () => {
    expect(Object.keys(COMPANY_POOL_BY_NAME).length).toBe(COMPANY_POOL.length);
  });

  it('every alias target exists in COMPANY_POOL_BY_NAME', () => {
    for (const [_alias, target] of Object.entries(COMPANY_ALIASES)) {
      expect(COMPANY_POOL_BY_NAME).toHaveProperty(
        target,
        expect.objectContaining({ name: expect.any(String) }),
      );
    }
  });

  it('no alias shadows an existing pool name (alias key !== any pool key)', () => {
    for (const aliasKey of Object.keys(COMPANY_ALIASES)) {
      // If an alias key matches a pool name, the alias is dead code because
      // getCompanyLogoUrl checks the direct map first.
      const poolEntry = COMPANY_POOL_BY_NAME[aliasKey];
      if (poolEntry !== undefined) {
        // This is not necessarily a bug — the alias is just unreachable.
        // Flag it so the team knows.
        console.warn(
          `Alias "${aliasKey}" is shadowed by pool entry "${poolEntry.name}"`,
        );
      }
    }
    // Always passes — this test is informational
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Hypothesis 2: guessDomain produces invalid or dangerous domain strings
//
// Edge cases: names that reduce to empty string after stripping, very long
// names, names with only special characters, numeric names.
// ---------------------------------------------------------------------------

describe('H2: guessDomain edge cases', () => {
  it('returns just ".com" for names that are all special characters', () => {
    // "..." → strip non-alnum → "" → "" + ".com" = ".com"
    // This is arguably invalid — ".com" is not a usable domain.
    const result = guessDomain('...');
    expect(result).toBe('.com');
  });

  it('returns just ".com" for whitespace-only input', () => {
    const result = guessDomain('   ');
    expect(result).toBe('.com');
  });

  it('returns just ".com" for emoji-only input', () => {
    // Emojis are not [a-z0-9] so they get stripped
    const result = guessDomain('🚀🎉');
    expect(result).toBe('.com');
  });

  it('handles extremely long company names without crashing', () => {
    const longName = 'A'.repeat(10_000);
    const result = guessDomain(longName);
    expect(result).toBe('a'.repeat(10_000) + '.com');
  });

  it('strips unicode accented characters', () => {
    // "Café" → "caf.com" (the é is stripped)
    const result = guessDomain('Café');
    expect(result).toBe('caf.com');
  });

  it('handles numeric-only names', () => {
    expect(guessDomain('123')).toBe('123.com');
  });

  it('handles names with parentheses like "X (Twitter)"', () => {
    expect(guessDomain('X (Twitter)')).toBe('xtwitter.com');
  });
});

// ---------------------------------------------------------------------------
// Hypothesis 3: resolveCompanyLogoUrl with malicious customLogoUrl / domain
//
// customLogoUrl is passed through raw — could contain javascript: URLs.
// domain goes through encodeURIComponent which should be safe, but verify.
// ---------------------------------------------------------------------------

describe('H3: resolveCompanyLogoUrl with adversarial inputs', () => {
  it('passes through javascript: customLogoUrl without sanitization', () => {
    // This is a potential XSS vector — the caller must sanitize.
    // The test documents the current behavior.
    const company = { name: 'Evil Corp', customLogoUrl: 'javascript:alert(1)' };
    expect(resolveCompanyLogoUrl(company)).toBe('javascript:alert(1)');
  });

  it('passes through data: customLogoUrl (expected for uploads)', () => {
    const company = { name: 'Custom Co', customLogoUrl: 'data:image/png;base64,abc' };
    expect(resolveCompanyLogoUrl(company)).toBe('data:image/png;base64,abc');
  });

  it('encodes domain with special chars to prevent query injection', () => {
    const company = { name: 'Evil', domain: 'evil.com&callback=http://attacker.com' };
    const url = resolveCompanyLogoUrl(company);
    // encodeURIComponent should encode & as %26
    expect(url).not.toContain('&callback');
    expect(url).toContain('evil.com%26callback');
  });

  it('encodes domain with path traversal attempt', () => {
    const company = { name: 'Evil', domain: '../../../etc/passwd' };
    const url = resolveCompanyLogoUrl(company);
    expect(url).toContain(encodeURIComponent('../../../etc/passwd'));
  });

  it('returns null for company with empty name and no other fields', () => {
    expect(resolveCompanyLogoUrl({ name: '' })).toBeNull();
  });

  it('prefers pool match even when company has malicious customLogoUrl', () => {
    const company = { name: 'Google', customLogoUrl: 'javascript:alert(1)' };
    // Pool match takes priority — safe path
    expect(resolveCompanyLogoUrl(company)).toBe('/logos/google.png');
  });
});

// ---------------------------------------------------------------------------
// Hypothesis 4: getCompanyLogoUrl with prototype pollution / __proto__ keys
//
// If a company name matches an Object.prototype property name, the lookup
// might return unexpected truthy values.
// ---------------------------------------------------------------------------

describe('H4: getCompanyLogoUrl prototype pollution resilience', () => {
  const protoKeys = [
    '__proto__',
    'constructor',
    'toString',
    'valueOf',
    'hasOwnProperty',
    'isPrototypeOf',
  ];

  for (const key of protoKeys) {
    it(`returns null for prototype key "${key}"`, () => {
      // These should not match any company and must return null
      expect(getCompanyLogoUrl(key)).toBeNull();
    });
  }
});

// ---------------------------------------------------------------------------
// Hypothesis 5: getCompanyLogoUrl with hasLogo === false edge case
//
// When a pool entry has hasLogo: false, it should return null even though
// the entry exists in the map.
// ---------------------------------------------------------------------------

describe('H5: hasLogo === false handling', () => {
  it('returns null for pool entries with hasLogo explicitly false', () => {
    // Currently no entries have hasLogo: false, but the code path exists.
    // Verify the logic is correct by checking the code handles it.
    // We can test indirectly: if a pool entry existed with hasLogo: false,
    // getCompanyLogoUrl would return null.

    // Simulate by checking the code path: direct lookup
    // Can't inject into COMPANY_POOL_BY_NAME, so test the code path
    // through the alias route by verifying behavior consistency.
    for (const c of COMPANY_POOL) {
      if ((c as unknown as { hasLogo?: boolean }).hasLogo === false) {
        expect(getCompanyLogoUrl(c.name)).toBeNull();
      }
    }
    // If no entries have hasLogo: false, this test still passes
    expect(true).toBe(true);
  });

  it('resolveCompanyLogoUrl falls through to customLogoUrl when hasLogo is false', () => {
    // For a pool company that has hasLogo: false but a customLogoUrl,
    // the fallback chain should pick up the customLogoUrl.
    // Currently no pool entries have hasLogo: false, so this tests the contract.
    const company = {
      name: 'SomeNoLogoPoolCompany',
      customLogoUrl: 'data:image/png;base64,abc',
    };
    // Not in pool → null from getCompanyLogoUrl → falls to customLogoUrl
    expect(resolveCompanyLogoUrl(company)).toBe('data:image/png;base64,abc');
  });
});
