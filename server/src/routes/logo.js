import { Router } from 'express';

/**
 * Regex for a valid public domain: alphanumeric segments separated by dots,
 * with optional hyphens within segments. No paths, ports, or protocols.
 */
const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

/**
 * Patterns that indicate private/internal addresses — must be rejected
 * to prevent SSRF attacks.
 */
const BLOCKED_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^\d+\.\d+\.\d+\.\d+$/,     // block all raw IP addresses
  /^0x[0-9a-f]/i,              // block hex-encoded IP segments (e.g. 0x7f.0.0.1)
  /^0\d/,                      // block octal-encoded IP segments (e.g. 0177.0.0.1)
];

/**
 * Simple in-memory sliding-window rate limiter.
 *
 * @param {number} maxRequests - max requests per window
 * @param {number} windowMs   - window size in milliseconds
 * @returns {{ isAllowed: (ip: string) => boolean }}
 */
export function createRateLimiter(maxRequests = 30, windowMs = 60_000) {
  const requests = new Map();

  return {
    isAllowed(ip) {
      const now = Date.now();
      const timestamps = requests.get(ip) || [];
      const recent = timestamps.filter((t) => now - t < windowMs);

      if (recent.length >= maxRequests) {
        requests.set(ip, recent);
        return false;
      }

      if (recent.length === 0) {
        // First request in this window — clean up any stale IPs to prevent
        // unbounded Map growth from many unique visitors.
        if (requests.size > 1000) {
          for (const [key, ts] of requests) {
            if (ts.every((t) => now - t >= windowMs)) requests.delete(key);
          }
        }
      }

      recent.push(now);
      requests.set(ip, recent);
      return true;
    },
  };
}

/**
 * Validates that a domain string is a safe, public domain.
 *
 * @param {string} domain
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateDomain(domain) {
  if (!domain || typeof domain !== 'string') {
    return { valid: false, reason: 'Missing domain parameter' };
  }

  if (!DOMAIN_PATTERN.test(domain)) {
    return { valid: false, reason: 'Invalid domain format' };
  }

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(domain)) {
      return { valid: false, reason: 'Domain not allowed' };
    }
  }

  return { valid: true };
}

/**
 * Creates the logo proxy router.
 *
 * Proxies favicon requests to the Google Favicon API to avoid CORS issues
 * on the frontend. Includes domain validation, SSRF protection, content-type
 * verification, and rate limiting.
 *
 * @param {Object} [deps]
 * @param {Function} [deps.fetchFn]      - injectable fetch for testing
 * @param {Object}   [deps.rateLimiter]  - injectable rate limiter
 * @returns {import('express').Router}
 */
export function createLogoRouter(deps = {}) {
  const fetchFn     = deps.fetchFn     || globalThis.fetch;
  const rateLimiter = deps.rateLimiter || createRateLimiter();
  const router      = Router();

  /**
   * GET /api/logo?domain=example.com
   *
   * Proxies the request to Google's Favicon API and streams the image back.
   * Returns 128px PNG favicons with a 7-day cache header.
   */
  router.get('/', async (req, res) => {
    const { domain } = req.query;
    const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';

    if (!rateLimiter.isAllowed(clientIp)) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    const validation = validateDomain(domain);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.reason });
    }

    try {
      const upstreamUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
      const upstream = await fetchFn(upstreamUrl);

      if (!upstream.ok) {
        return res.status(502).json({ error: 'Failed to fetch logo from upstream' });
      }

      const contentType = upstream.headers.get('content-type') || '';
      if (!contentType.startsWith('image/')) {
        return res.status(502).json({ error: 'Upstream did not return an image' });
      }

      const buffer = Buffer.from(await upstream.arrayBuffer());

      res.set('Content-Type', contentType);
      res.set('Cache-Control', 'public, max-age=604800');
      res.send(buffer);
    } catch (err) {
      console.error('[logo] proxy error:', err.message);
      res.status(502).json({ error: 'Logo proxy failed' });
    }
  });

  return router;
}
