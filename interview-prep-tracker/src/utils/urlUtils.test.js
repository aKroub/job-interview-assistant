import { sanitizeVideoCallUrl, isValidVideoCallUrl } from './urlUtils';

// ---------------------------------------------------------------------------
// sanitizeVideoCallUrl
// ---------------------------------------------------------------------------

describe('sanitizeVideoCallUrl', () => {
  it('returns a valid https URL unchanged', () => {
    expect(sanitizeVideoCallUrl('https://zoom.us/j/123')).toBe('https://zoom.us/j/123');
  });

  it('returns a valid http URL unchanged', () => {
    expect(sanitizeVideoCallUrl('http://internal.corp/meeting/42')).toBe('http://internal.corp/meeting/42');
  });

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeVideoCallUrl('  https://zoom.us/j/123  ')).toBe('https://zoom.us/j/123');
  });

  it('returns empty string for undefined', () => {
    expect(sanitizeVideoCallUrl(undefined)).toBe('');
  });

  it('returns empty string for null', () => {
    expect(sanitizeVideoCallUrl(null)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(sanitizeVideoCallUrl('')).toBe('');
  });

  it('returns empty string for whitespace-only string', () => {
    expect(sanitizeVideoCallUrl('   ')).toBe('');
  });

  // --- Dangerous URI schemes ---

  it('rejects javascript: URI', () => {
    expect(sanitizeVideoCallUrl('javascript:alert(1)')).toBe('');
  });

  it('rejects JavaScript: (mixed case)', () => {
    expect(sanitizeVideoCallUrl('JavaScript:alert(1)')).toBe('');
  });

  it('rejects JAVASCRIPT: (upper case)', () => {
    expect(sanitizeVideoCallUrl('JAVASCRIPT:alert(1)')).toBe('');
  });

  it('rejects javascript: URI with leading whitespace', () => {
    expect(sanitizeVideoCallUrl('  javascript:alert(1)  ')).toBe('');
  });

  it('rejects data: URI', () => {
    expect(sanitizeVideoCallUrl('data:text/html,<script>alert(1)</script>')).toBe('');
  });

  it('rejects DATA: URI (upper case)', () => {
    expect(sanitizeVideoCallUrl('DATA:text/html,xss')).toBe('');
  });

  it('rejects vbscript: URI', () => {
    expect(sanitizeVideoCallUrl('vbscript:msgbox("xss")')).toBe('');
  });

  it('rejects blob: URI', () => {
    expect(sanitizeVideoCallUrl('blob:https://evil.com/uuid')).toBe('');
  });

  it('rejects file: URI', () => {
    expect(sanitizeVideoCallUrl('file:///etc/passwd')).toBe('');
  });

  it('rejects ftp: URI', () => {
    expect(sanitizeVideoCallUrl('ftp://evil.com/payload')).toBe('');
  });

  // --- Structurally invalid URLs ---

  it('rejects a URL that passes the protocol regex but is structurally invalid', () => {
    expect(sanitizeVideoCallUrl('https://')).toBe('');
  });

  // --- Does not mutate input ---

  it('does not mutate the input string', () => {
    const input = '  https://zoom.us/j/123  ';
    sanitizeVideoCallUrl(input);
    expect(input).toBe('  https://zoom.us/j/123  ');
  });
});

// ---------------------------------------------------------------------------
// isValidVideoCallUrl
// ---------------------------------------------------------------------------

describe('isValidVideoCallUrl', () => {
  it('returns true for a valid https URL', () => {
    expect(isValidVideoCallUrl('https://zoom.us/j/123')).toBe(true);
  });

  it('returns true for a valid http URL', () => {
    expect(isValidVideoCallUrl('http://internal.corp/meeting')).toBe(true);
  });

  it('returns false for undefined', () => {
    expect(isValidVideoCallUrl(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidVideoCallUrl('')).toBe(false);
  });

  it('returns false for javascript: URI', () => {
    expect(isValidVideoCallUrl('javascript:alert(1)')).toBe(false);
  });

  it('returns false for data: URI', () => {
    expect(isValidVideoCallUrl('data:text/html,<h1>XSS</h1>')).toBe(false);
  });
});
