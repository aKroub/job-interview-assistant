interface CompanyLogoProps {
  logoUrl: string | null;
  companyName: string;
  size?: number;
  className?: string;
}

/**
 * Renders a company logo image if a URL is available, otherwise renders nothing.
 *
 * The image is decorative (the company name is always present as text nearby),
 * so `alt=""` and `aria-hidden="true"` avoid screen-reader duplication.
 * On load error the image hides itself silently.
 */
export function CompanyLogo({ logoUrl, size = 16, className = '' }: CompanyLogoProps) {
  if (!logoUrl) return null;

  return (
    <img
      src={logoUrl}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={`rounded-sm shrink-0 ${className}`}
      loading="lazy"
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  );
}
