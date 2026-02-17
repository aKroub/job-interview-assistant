import React from 'react';

/**
 * Displays an inline validation error message beneath a form field.
 * Renders nothing when `message` is falsy — safe to render unconditionally.
 *
 * @param {{
 *   message: string | null | undefined,
 * }} props
 */
export function FormError({ message }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1 text-xs text-red-600">
      {message}
    </p>
  );
}
