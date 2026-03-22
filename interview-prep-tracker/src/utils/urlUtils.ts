/**
 * Sanitise a video-call URL so that only valid http(s) links are persisted or
 * rendered as `<a href>` values. This prevents `javascript:`, `data:`, `blob:`,
 * and other dangerous URI schemes from reaching the DOM.
 *
 * The check is intentionally strict:
 * 1. Trim leading/trailing whitespace (common after paste).
 * 2. Reject anything that does not start with `http://` or `https://`.
 * 3. Verify the result parses as a structurally valid URL via the `URL` constructor.
 *
 * @param raw — the user-supplied URL string (may be empty/undefined).
 * @returns the trimmed URL when safe, or `''` when unsafe / empty.
 */
export function sanitizeVideoCallUrl(raw: string | undefined | null): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) return '';

  try {
    // eslint-disable-next-line no-new -- validation only
    new URL(trimmed);
  } catch {
    return '';
  }

  return trimmed;
}

/**
 * Returns `true` when `raw` is a non-empty, sanitised http(s) URL.
 *
 * Convenience predicate used by display logic to decide whether a "Join call"
 * link should be rendered.
 *
 * @param raw - the stored video-call URL.
 */
export function isValidVideoCallUrl(raw: string | undefined | null): boolean {
  return sanitizeVideoCallUrl(raw) !== '';
}
