import React from 'react';

/**
 * Renders a form field label with an optional red required-field asterisk.
 *
 * @param {{
 *   children:  React.ReactNode,
 *   required?: boolean,
 *   htmlFor?:  string,
 * }} props
 */
export function FieldLabel({ children, required = false, htmlFor }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700 mb-1">
      {children}
      {required && (
        <span className="ml-1 text-red-500" aria-hidden="true">*</span>
      )}
    </label>
  );
}
