import React from 'react';

/**
 * Renders a company logo image if a URL is available, otherwise renders nothing.
 *
 * The image is decorative (the company name is always present as text nearby),
 * so `alt=""` and `aria-hidden="true"` are intentional. On load error the
 * image hides itself silently — satisfying the "no fallback icon" requirement.
 *
 * @param {{ logoUrl: string | null, companyName: string, size?: number, className?: string }} props
 */
export function CompanyLogo({ logoUrl, companyName, size = 16, className = '' }) {
  if (!logoUrl) return null;

  return (
    <img
      src={logoUrl}
      alt={`${companyName} logo`}
      width={size}
      height={size}
      className={`rounded-sm shrink-0 ${className}`}
      loading="lazy"
      onError={(e) => { e.target.style.display = 'none'; }}
    />
  );
}
