import { describe, it, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createLogoRouter, validateDomain, createRateLimiter } from '../../src/routes/logo.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock fetch that returns a configurable response.
 */
function createMockFetch({ status = 200, contentType = 'image/png', body = Buffer.from([0x89, 0x50]) } = {}) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name === 'content-type' ? contentType : null) },
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  });
}

/**
 * Creates a test Express app with the logo router mounted.
 */
function createTestApp(deps = {}) {
  const app = express();
  app.use('/api/logo', createLogoRouter(deps));
  return app;
}

// ---------------------------------------------------------------------------
// validateDomain (unit tests)
// ---------------------------------------------------------------------------

describe('validateDomain', () => {
  it('accepts valid public domains', () => {
    expect(validateDomain('google.com')).toEqual({ valid: true });
    expect(validateDomain('paloaltonetworks.com')).toEqual({ valid: true });
    expect(validateDomain('cheq.ai')).toEqual({ valid: true });
    expect(validateDomain('my-company.co.uk')).toEqual({ valid: true });
  });

  it('rejects empty or missing input', () => {
    expect(validateDomain('')).toEqual({ valid: false, reason: 'Missing domain parameter' });
    expect(validateDomain(null)).toEqual({ valid: false, reason: 'Missing domain parameter' });
    expect(validateDomain(undefined)).toEqual({ valid: false, reason: 'Missing domain parameter' });
  });

  it('rejects domains with paths or protocols', () => {
    expect(validateDomain('google.com/path').valid).toBe(false);
    expect(validateDomain('http://google.com').valid).toBe(false);
  });

  it('rejects localhost and private IPs', () => {
    expect(validateDomain('localhost').valid).toBe(false);
    expect(validateDomain('127.0.0.1').valid).toBe(false);
    expect(validateDomain('10.0.0.1').valid).toBe(false);
    expect(validateDomain('192.168.1.1').valid).toBe(false);
    expect(validateDomain('169.254.0.1').valid).toBe(false);
    expect(validateDomain('0.0.0.0').valid).toBe(false);
    expect(validateDomain('172.16.0.1').valid).toBe(false);
  });

  it('rejects raw IP addresses', () => {
    expect(validateDomain('8.8.8.8').valid).toBe(false);
    expect(validateDomain('1.2.3.4').valid).toBe(false);
  });

  it('rejects single-segment domains', () => {
    expect(validateDomain('localhost').valid).toBe(false);
    expect(validateDomain('intranet').valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createRateLimiter (unit tests)
// ---------------------------------------------------------------------------

describe('createRateLimiter', () => {
  it('allows requests under the limit', () => {
    const limiter = createRateLimiter(3, 60_000);
    expect(limiter.isAllowed('1.1.1.1')).toBe(true);
    expect(limiter.isAllowed('1.1.1.1')).toBe(true);
    expect(limiter.isAllowed('1.1.1.1')).toBe(true);
  });

  it('blocks requests over the limit', () => {
    const limiter = createRateLimiter(2, 60_000);
    limiter.isAllowed('1.1.1.1');
    limiter.isAllowed('1.1.1.1');
    expect(limiter.isAllowed('1.1.1.1')).toBe(false);
  });

  it('tracks IPs independently', () => {
    const limiter = createRateLimiter(1, 60_000);
    limiter.isAllowed('1.1.1.1');
    expect(limiter.isAllowed('1.1.1.1')).toBe(false);
    expect(limiter.isAllowed('2.2.2.2')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /api/logo (integration tests)
// ---------------------------------------------------------------------------

describe('GET /api/logo', () => {
  it('proxies a valid domain and returns an image', async () => {
    const mockBody = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const fetchFn = createMockFetch({ body: mockBody });
    const app = createTestApp({ fetchFn });

    const res = await request(app).get('/api/logo?domain=google.com');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^image\//);
    expect(res.headers['cache-control']).toContain('max-age=604800');
  });

  it('returns 400 for missing domain', async () => {
    const app = createTestApp({ fetchFn: createMockFetch() });

    const res = await request(app).get('/api/logo');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing domain parameter');
  });

  it('returns 400 for invalid domain format', async () => {
    const app = createTestApp({ fetchFn: createMockFetch() });

    const res = await request(app).get('/api/logo?domain=not_a_domain');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid domain format');
  });

  it('returns 400 for private IP addresses', async () => {
    const app = createTestApp({ fetchFn: createMockFetch() });

    const res = await request(app).get('/api/logo?domain=192.168.1.1');

    expect(res.status).toBe(400);
  });

  it('returns 502 when upstream fails', async () => {
    const fetchFn = createMockFetch({ status: 500 });
    const app = createTestApp({ fetchFn });

    const res = await request(app).get('/api/logo?domain=example.com');

    expect(res.status).toBe(502);
  });

  it('returns 502 when upstream returns non-image content', async () => {
    const fetchFn = createMockFetch({ contentType: 'text/html' });
    const app = createTestApp({ fetchFn });

    const res = await request(app).get('/api/logo?domain=example.com');

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('Upstream did not return an image');
  });

  it('returns 429 when rate limited', async () => {
    const rateLimiter = { isAllowed: () => false };
    const app = createTestApp({ fetchFn: createMockFetch(), rateLimiter });

    const res = await request(app).get('/api/logo?domain=google.com');

    expect(res.status).toBe(429);
    expect(res.body.error).toBe('Too many requests');
  });
});
