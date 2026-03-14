import { COMPANY_POOL_BY_NAME, COMPANY_ALIASES } from '../constants/companies';

/**
 * Returns the logo URL for a company name by checking the static pool.
 *
 * Resolution order:
 * 1. Direct match in COMPANY_POOL_BY_NAME (case-insensitive)
 * 2. Alias lookup via COMPANY_ALIASES (e.g. "Facebook" → "Meta")
 * 3. No match → null (caller should render nothing)
 *
 * @param {string} companyName - The company name to look up.
 * @returns {string | null} Absolute path to the static logo PNG, or null.
 */
export function getCompanyLogoUrl(companyName) {
  if (!companyName) return null;

  const key = companyName.toLowerCase();

  const direct = COMPANY_POOL_BY_NAME[key];
  if (direct) return direct.hasLogo === false ? null : `/logos/${direct.slug}.png`;

  const aliasTarget = COMPANY_ALIASES[key];
  if (aliasTarget) {
    const aliased = COMPANY_POOL_BY_NAME[aliasTarget];
    if (aliased) return aliased.hasLogo === false ? null : `/logos/${aliased.slug}.png`;
  }

  return null;
}

/**
 * Resolves the best logo URL for a company object using the full fallback chain.
 *
 * Resolution order:
 * 1. Static pool match (via getCompanyLogoUrl)
 * 2. User-uploaded custom logo (customLogoUrl on the company object)
 * 3. Domain-based API fetch (domain on the company object)
 * 4. No match → null
 *
 * Custom uploads take priority over domain guesses because the user
 * explicitly chose that image.
 *
 * @param {{ name: string, domain?: string, customLogoUrl?: string }} company
 * @returns {string | null}
 */
export function resolveCompanyLogoUrl(company) {
  if (!company) return null;

  const poolUrl = getCompanyLogoUrl(company.name);
  if (poolUrl) return poolUrl;

  if (company.customLogoUrl) return company.customLogoUrl;

  if (company.domain) return `/api/logo?domain=${company.domain}`;

  return null;
}

/**
 * Best-effort heuristic to guess a company's website domain from its name.
 *
 * Strips non-alphanumeric characters, lowercases, and appends ".com".
 * This is a **heuristic only** — the result should always be presented
 * to the user as an editable, pre-filled suggestion.
 *
 * @param {string} companyName - The company name to guess a domain for.
 * @returns {string} A guessed domain string (e.g. "checkpointsoftware.com").
 */
export function guessDomain(companyName) {
  if (!companyName) return '';
  return companyName.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
}
