/**
 * Pre-populated company pool with slugs and domains for logo resolution.
 *
 * Each entry maps to a static logo file at `/logos/{slug}.png` when
 * `hasLogo` is true (default). Companies where `hasLogo` is explicitly
 * `false` are included for the dropdown but display no logo.
 *
 * The pool is the source of truth for the company selection dropdown
 * and logo display across the app.
 */
export const COMPANY_POOL = [
  { slug: 'adobe',          name: 'Adobe',          domain: 'adobe.com' },
  { slug: 'airbnb',         name: 'Airbnb',         domain: 'airbnb.com' },
  { slug: 'amazon',         name: 'Amazon',         domain: 'amazon.com' },
  { slug: 'anthropic',      name: 'Anthropic',      domain: 'anthropic.com' },
  { slug: 'apple',          name: 'Apple',          domain: 'apple.com' },
  { slug: 'cellebrite',     name: 'Cellebrite',     domain: 'cellebrite.com' },
  { slug: 'check-point',    name: 'Check Point',    domain: 'checkpoint.com' },
  { slug: 'cheq',           name: 'CHEQ',           domain: 'cheq.ai' },
  { slug: 'cisco',          name: 'Cisco',          domain: 'cisco.com' },
  { slug: 'corsight-ai',    name: 'Corsight AI',    domain: 'corsight.ai' },
  { slug: 'databricks',     name: 'Databricks',     domain: 'databricks.com' },
  { slug: 'datarails',      name: 'Datarails',      domain: 'datarails.com' },
  { slug: 'dream-security', name: 'Dream Security', domain: 'dreamgroup.com' },
  { slug: 'forter',         name: 'Forter',         domain: 'forter.com' },
  { slug: 'genpact',        name: 'Genpact',        domain: 'genpact.com' },
  { slug: 'google',         name: 'Google',         domain: 'google.com' },
  { slug: 'hypernative',    name: 'Hypernative',    domain: 'hypernative.io' },
  { slug: 'hyro',           name: 'Hyro',           domain: 'hyro.ai' },
  { slug: 'intuit',         name: 'Intuit',         domain: 'intuit.com' },
  { slug: 'jfrog',          name: 'JFrog',          domain: 'jfrog.com' },
  { slug: 'jobgether',      name: 'Jobgether',      domain: 'jobgether.com' },
  { slug: 'kela',           name: 'Kela',           domain: 'kelacyber.com' },
  { slug: 'meta',           name: 'Meta',           domain: 'meta.com' },
  { slug: 'microsoft',      name: 'Microsoft',      domain: 'microsoft.com' },
  { slug: 'nexxen',         name: 'Nexxen',         domain: 'nexxen.com' },
  { slug: 'netflix',        name: 'Netflix',        domain: 'netflix.com' },
  { slug: 'nice',           name: 'NICE',           domain: 'nice.com' },
  { slug: 'nominal',        name: 'Nominal',        domain: 'nominal.io' },
  { slug: 'nvidia',         name: 'Nvidia',         domain: 'nvidia.com' },
  { slug: 'oracle',         name: 'Oracle',         domain: 'oracle.com' },
  { slug: 'palo-alto',      name: 'Palo Alto',      domain: 'paloaltonetworks.com' },
  { slug: 'pango',          name: 'Pango',          domain: 'pango.co.il' },
  { slug: 'rekor',          name: 'Rekor',          domain: 'rekor.ai' },
  { slug: 'salesforce',     name: 'Salesforce',     domain: 'salesforce.com' },
  { slug: 'sentinelone',    name: 'SentinelOne',    domain: 'sentinelone.com' },
  { slug: 'snowflake',      name: 'Snowflake',      domain: 'snowflake.com' },
  { slug: 'solitics',       name: 'Solitics',       domain: 'solitics.com' },
  { slug: 'spotify',        name: 'Spotify',        domain: 'spotify.com' },
  { slug: 'stripe',         name: 'Stripe',         domain: 'stripe.com' },
  { slug: 'tesla',          name: 'Tesla',          domain: 'tesla.com' },
  { slug: 'torq',           name: 'Torq',           domain: 'torq.io' },
  { slug: 'uber',           name: 'Uber',           domain: 'uber.com' },
  { slug: 'unipaas',        name: 'Unipaas',        domain: 'unipaas.com' },
  { slug: 'varonis',        name: 'Varonis',        domain: 'varonis.com' },
  { slug: 'vayu',           name: 'Vayu',           domain: 'withvayu.com' },
  { slug: 'wonderful',      name: 'Wonderful',      domain: 'wonderful.com' },
  { slug: 'x',              name: 'X (Twitter)',     domain: 'x.com' },
  { slug: 'yotpo',          name: 'Yotpo',          domain: 'yotpo.com' },
  { slug: 'zoom',           name: 'Zoom',           domain: 'zoom.us' },
  { slug: 'zyg',            name: 'ZyG',            domain: 'zyg.com' },
];

/**
 * Lookup map: lowercased company name -> pool entry.
 * Enables O(1) logo resolution from a company name string.
 */
export const COMPANY_POOL_BY_NAME = Object.fromEntries(
  COMPANY_POOL.map((c) => [c.name.toLowerCase(), c]),
);

/**
 * Aliases for company names that differ between data sources.
 * Maps lowercased alias -> lowercased canonical pool name.
 *
 * Example: SYSTEM_DESIGN_QUESTIONS uses "Facebook" as a key,
 * but the pool entry is "Meta".
 */
export const COMPANY_ALIASES = {
  facebook: 'meta',
};
