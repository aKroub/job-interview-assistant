import type { ReactNode } from 'react';

interface FieldLabelProps {
  children: ReactNode;
  required?: boolean;
  htmlFor?: string;
}

/**
 * Renders a form field label with an optional red required-field asterisk.
 */
export function FieldLabel({ children, required = false, htmlFor }: FieldLabelProps) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700 mb-1">
      {children}
      {required && (
        <span className="ml-1 text-red-500" aria-hidden="true">*</span>
      )}
    </label>
  );
}
