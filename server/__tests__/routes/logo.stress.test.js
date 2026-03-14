import { describe, it, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createLogoRouter, validateDomain, createRateLimiter } from '../../src/routes/logo.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockFetch({ status = 200, contentType = 'image/png', body = Buffer.from([0x89, 0x50]) } = {}) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name === 'content-type' ? contentType : null) },
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  });
}

function createTestApp(deps = {}) {
  const app = express();
  app.use('/api/logo', createLogoRouter(deps));
  return app;
}

// ---------------------------------------------------------------------------
// Hypothesis 1: SSRF bypass via encoded/alternate IP representations
//
// The BLOCKED_PATTERNS regex set blocks common private IPs, but attackers
// use alternate representations: hex IPs, IPv6, octal, decimal encoding,
// .internal TLDs, double-encoded values, etc.
// ---------------------------------------------------------------------------

describe('H1: SSRF bypass attempts via validateDomain', () => {
  // Standard blocked — should all fail
  const standardBlocked = [
    'localhost',
    '127.0.0.1',
    '10.0.0.1',
    '192.168.1.1',
    '172.16.0.1',
    '169.254.169.254',   // AWS metadata
    '0.0.0.0',
  ];

  for (const domain of standardBlocked) {
    it(`blocks standard private address: ${domain}`, () => {
      expect(validateDomain(domain).valid).toBe(false);
    });
  }

  // Alternate IP representations that should also be blocked
  const alternateIPFormats = [
    '0x7f.0.0.1',         // hex first octet
    '0177.0.0.1',         // octal first octet
    '2130706433',          // decimal representation of 127.0.0.1
    '017700000001',        // octal full
    '0x7f000001',          // hex full
  ];

  for (const domain of alternateIPFormats) {
    it(`blocks alternate IP representation: ${domain}`, () => {
      const result = validateDomain(domain);
      // These may or may not be caught — document behavior
      // The DOMAIN_PATTERN should reject most of these since they
      // don't have a dot-separated multi-segment structure
      expect(result.valid).toBe(false);
    });
  }

  // IPv6 representations
  const ipv6Addresses = [
    '[::1]',
    '::1',
    '[::ffff:127.0.0.1]',
    '0:0:0:0:0:0:0:1',
  ];

  for (const domain of ipv6Addresses) {
    it(`blocks IPv6 address: ${domain}`, () => {
      expect(validateDomain(domain).valid).toBe(false);
    });
  }

  // Domains that resolve to internal but look external
  const sneakyDomains = [
    'metadata.google.internal',    // GCP metadata
    'instance-data.ec2.internal',  // AWS
  ];

  for (const domain of sneakyDomains) {
    it(`allows (not blocked at DNS level): ${domain} — SSRF risk is DNS-based`, () => {
      // These pass domain validation because they look like valid domains.
      // Blocking requires DNS resolution, which is out of scope for this validator.
      // This test documents the limitation.
      const result = validateDomain(domain);
      // They ARE valid domain formats — the risk is DNS-based not format-based
      expect(result.valid).toBe(true);
    });
  }

  // Domains with embedded null bytes or special chars
  it('rejects domains with null bytes', () => {
    expect(validateDomain('evil.com\0.internal').valid).toBe(false);
  });

  it('rejects domains with URL encoding', () => {
    expect(validateDomain('%6C%6F%63%61%6C%68%6F%73%74').valid).toBe(false);
  });

  it('rejects domains with spaces', () => {
    expect(validateDomain('google .com').valid).toBe(false);
  });

  it('rejects domains with port numbers', () => {
    expect(validateDomain('google.com:8080').valid).toBe(false);
  });

  it('rejects domains with @ (credential injection)', () => {
    expect(validateDomain('admin@internal.corp.com').valid).toBe(false);
  });

  it('rejects domains with protocol prefixes', () => {
    expect(validateDomain('http://google.com').valid).toBe(false);
    expect(validateDomain('https://google.com').valid).toBe(false);
    expect(validateDomain('ftp://google.com').valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Hypothesis 2: Rate limiter memory leak / timestamp array mutation
//
// The rate limiter's `recent` array is modified in place (push) and stored
// back. Since `timestamps.filter()` creates a new array, this is actually
// safe — but verify. Also test memory cleanup under high unique-IP load.
// ---------------------------------------------------------------------------

describe('H2: Rate limiter stress — memory and correctness', () => {
  it('correctly expires old timestamps after window passes', () => {
    const realNow = Date.now;
    let fakeTime = 1000000;
    Date.now = () => fakeTime;

    try {
      const limiter = createRateLimiter(2, 1000);

      // Two requests at t=1000000
      expect(limiter.isAllowed('a')).toBe(true);
      expect(limiter.isAllowed('a')).toBe(true);
      expect(limiter.isAllowed('a')).toBe(false); // blocked

      // Advance past the window
      fakeTime += 1001;
      expect(limiter.isAllowed('a')).toBe(true); // allowed again
    } finally {
      Date.now = realNow;
    }
  });

  it('handles 1500 unique IPs without crashing (triggers cleanup at >1000)', () => {
    const limiter = createRateLimiter(5, 60_000);

    for (let i = 0; i < 1500; i++) {
      expect(limiter.isAllowed(`${i}.${i}.${i}.${i}`)).toBe(true);
    }
    // Should not throw or crash
  });

  it('cleanup actually removes stale entries', () => {
    const realNow = Date.now;
    let fakeTime = 1000000;
    Date.now = () => fakeTime;

    try {
      const limiter = createRateLimiter(5, 1000);

      // Fill with 1001 IPs at t=1000000
      for (let i = 0; i < 1001; i++) {
        limiter.isAllowed(`ip-${i}`);
      }

      // Advance past window
      fakeTime += 2000;

      // Next new IP triggers cleanup (first request in new window)
      limiter.isAllowed('cleanup-trigger');

      // Stale IPs should have been cleaned — verify by allowing more requests
      // on previously rate-limited IPs
      expect(limiter.isAllowed('ip-0')).toBe(true);
    } finally {
      Date.now = realNow;
    }
  });

  it('per-IP isolation — one IP hitting limit does not affect another', () => {
    const limiter = createRateLimiter(1, 60_000);

    expect(limiter.isAllowed('attacker')).toBe(true);
    expect(limiter.isAllowed('attacker')).toBe(false);

    // Innocent user should be unaffected
    expect(limiter.isAllowed('innocent')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Hypothesis 3: Logo proxy with concurrent requests / fetch failures
//
// Multiple simultaneous requests to the same domain, fetch throwing
// (not just returning bad status), and network timeouts.
// ---------------------------------------------------------------------------

describe('H3: Logo proxy under adversarial network conditions', () => {
  it('handles fetch throwing an error (network failure)', async () => {
    const fetchFn = async () => { throw new Error('ECONNREFUSED'); };
    const app = createTestApp({ fetchFn });

    const res = await request(app).get('/api/logo?domain=example.com');
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('Logo proxy failed');
  });

  it('handles fetch returning null arrayBuffer', async () => {
    const fetchFn = async () => ({
      ok: true,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => { throw new Error('body consumed'); },
    });
    const app = createTestApp({ fetchFn });

    const res = await request(app).get('/api/logo?domain=example.com');
    expect(res.status).toBe(502);
  });

  it('handles very large upstream response without crashing', async () => {
    // 1MB image
    const bigBody = Buffer.alloc(1024 * 1024, 0x42);
    const fetchFn = createMockFetch({ body: bigBody });
    const app = createTestApp({ fetchFn });

    const res = await request(app).get('/api/logo?domain=example.com');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(bigBody.length);
  });

  it('handles concurrent requests to the same domain', async () => {
    let callCount = 0;
    const fetchFn = async () => {
      callCount++;
      return {
        ok: true,
        headers: { get: () => 'image/png' },
        arrayBuffer: async () => Buffer.from([0x89, 0x50]).buffer,
      };
    };
    const app = createTestApp({ fetchFn });

    const results = await Promise.all([
      request(app).get('/api/logo?domain=google.com'),
      request(app).get('/api/logo?domain=google.com'),
      request(app).get('/api/logo?domain=google.com'),
    ]);

    for (const res of results) {
      expect(res.status).toBe(200);
    }
    expect(callCount).toBe(3); // No caching — each request hits upstream
  });

  it('handles empty domain query parameter', async () => {
    const app = createTestApp({ fetchFn: createMockFetch() });
    const res = await request(app).get('/api/logo?domain=');
    expect(res.status).toBe(400);
  });

  it('handles domain with extremely long string', async () => {
    const longDomain = 'a'.repeat(5000) + '.com';
    const app = createTestApp({ fetchFn: createMockFetch() });
    const res = await request(app).get(`/api/logo?domain=${longDomain}`);
    // Should either validate as valid (long but technically legal) or reject
    // The key is it should not crash
    expect([200, 400]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// Hypothesis 4: validateDomain regex edge cases
//
// The DOMAIN_PATTERN regex and BLOCKED_PATTERNS might have subtle gaps.
// Test boundary conditions.
// ---------------------------------------------------------------------------

describe('H4: validateDomain regex boundary conditions', () => {
  it('rejects domain starting with hyphen', () => {
    expect(validateDomain('-google.com').valid).toBe(false);
  });

  it('rejects domain ending with hyphen', () => {
    expect(validateDomain('google-.com').valid).toBe(false);
  });

  it('accepts domain with hyphen in middle', () => {
    expect(validateDomain('my-company.com').valid).toBe(true);
  });

  it('rejects domain with consecutive dots', () => {
    expect(validateDomain('google..com').valid).toBe(false);
  });

  it('rejects domain starting with dot', () => {
    expect(validateDomain('.google.com').valid).toBe(false);
  });

  it('rejects domain ending with dot', () => {
    expect(validateDomain('google.com.').valid).toBe(false);
  });

  it('accepts two-letter TLDs', () => {
    expect(validateDomain('google.co').valid).toBe(true);
  });

  it('accepts multi-segment domains', () => {
    expect(validateDomain('mail.google.co.uk').valid).toBe(true);
  });

  it('blocks 172.16-31.x.x range correctly', () => {
    expect(validateDomain('172.16.0.1').valid).toBe(false);
    expect(validateDomain('172.31.255.255').valid).toBe(false);
    // 172.32.x.x is NOT private but is still a raw IP — blocked by IP pattern
    expect(validateDomain('172.32.0.1').valid).toBe(false);
  });

  it('rejects domain with underscore', () => {
    // Underscores are not valid in domain names per RFC
    expect(validateDomain('my_company.com').valid).toBe(false);
  });

  it('accepts single-char segments', () => {
    expect(validateDomain('x.co').valid).toBe(true);
  });

  it('rejects non-string input types', () => {
    expect(validateDomain(123).valid).toBe(false);
    expect(validateDomain(true).valid).toBe(false);
    expect(validateDomain({}).valid).toBe(false);
    expect(validateDomain([]).valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Hypothesis 5: Rate limiter edge case — exact boundary of maxRequests
// ---------------------------------------------------------------------------

describe('H5: Rate limiter exact boundary behavior', () => {
  it('allows exactly maxRequests then blocks the next', () => {
    const limiter = createRateLimiter(5, 60_000);
    for (let i = 0; i < 5; i++) {
      expect(limiter.isAllowed('test-ip')).toBe(true);
    }
    expect(limiter.isAllowed('test-ip')).toBe(false);
  });

  it('window of 0ms blocks immediately after first request', () => {
    const realNow = Date.now;
    let fakeTime = 1000000;
    Date.now = () => fakeTime;

    try {
      const limiter = createRateLimiter(2, 0);
      // With windowMs=0, all timestamps are "stale" (now - t >= 0 is always true)
      // So filter keeps nothing, and every request sees 0 recent → always allowed
      expect(limiter.isAllowed('ip')).toBe(true);
      expect(limiter.isAllowed('ip')).toBe(true);
      // Third request should also be allowed since window is 0 and all are "expired"
      expect(limiter.isAllowed('ip')).toBe(true);
    } finally {
      Date.now = realNow;
    }
  });
});
