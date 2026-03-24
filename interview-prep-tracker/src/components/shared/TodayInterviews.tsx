import { useState } from 'react';
import { CalendarCheck, ExternalLink, HelpCircle } from 'lucide-react';
import { TYPE_CONFIG } from '../../constants/interviewTypes.js';
import { resolveCompanyLogoUrl } from '../../utils/companyLogoUtils.js';
import { isValidVideoCallUrl, sanitizeVideoCallUrl } from '../../utils/urlUtils.js';
import { CompanyLogo } from './CompanyLogo.js';
import type { FlattenedInterview, InterviewTypeName } from '../../types';

/**
 * A single compact interview chip within the today strip.
 *
 * Defined at module level (never inside TodayInterviews render scope)
 * to preserve React reconciliation and allow isolated testing.
 *
 * For Video Interview type with a valid video call link, the video icon
 * is clickable and toggles a "Join call" link below the chip. Clicking
 * the icon does not trigger the chip's main onClick (navigate to timeline).
 *
 * The open/closed state is controlled by the parent via `isCallLinkOpen`
 * and `onToggleCallLink` so that only one chip's panel can be open at a
 * time, and navigating to a different interview auto-closes it.
 *
 * @param {{
 *   interview:        Object,
 *   onClick?:         (interview: Object) => void,
 *   isCallLinkOpen:   boolean,
 *   onToggleCallLink: () => void,
 * }} props
 */
interface TodayInterviewItemProps {
  interview: FlattenedInterview;
  onClick?: (interview: FlattenedInterview) => void;
  isCallLinkOpen: boolean;
  onToggleCallLink: () => void;
}

function TodayInterviewItem({ interview, onClick, isCallLinkOpen, onToggleCallLink }: TodayInterviewItemProps) {
  const typeConfig = TYPE_CONFIG[interview.type as InterviewTypeName];
  const InterviewIcon = typeConfig ? typeConfig.Icon : HelpCircle;
  const logoUrl = resolveCompanyLogoUrl({
    name: interview.companyName,
    domain: interview.companyDomain ?? undefined,
    customLogoUrl: interview.companyCustomLogoUrl ?? undefined,
  });

  const isVideoInterview = interview.type === 'Video Interview';
  const hasVideoCallLink = isVideoInterview && isValidVideoCallUrl(interview.videoCallUrl ?? '');
  const trimmedVideoLink = hasVideoCallLink ? sanitizeVideoCallUrl(interview.videoCallUrl!) : '';

  const baseClasses =
    'flex items-center gap-1.5 bg-white border rounded-md px-3 py-1.5 text-sm transition';
  const iconColour = typeConfig?.colour || 'text-purple-500';
  const borderClass = isCallLinkOpen ? 'border-blue-300' : 'border-purple-200';
  const interactiveClasses = onClick
    ? 'cursor-pointer hover:border-purple-400 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-1 active:scale-[0.98]'
    : '';

  function handleClick() {
    if (onClick) onClick(interview);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // Guard: only handle key events that originate on the chip div itself,
    // not on nested interactive children (e.g. the video-icon button).
    // Without this, pressing Enter while focused on the inner button would
    // also trigger the chip's navigate action — a WCAG nested-interactive issue.
    if (onClick && e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick(interview);
    }
  }

  function handleVideoIconClick(e: React.MouseEvent) {
    e.stopPropagation();
    onToggleCallLink();
  }

  const timeLabel = interview.time || 'TBD';
  const ariaLabel = onClick
    ? `View ${interview.companyName} ${interview.type} at ${timeLabel}`
    : undefined;

  return (
    <div className={`flex flex-col rounded-lg transition ${isCallLinkOpen ? 'bg-blue-50 p-1 -m-1' : ''}`}>
      <div
        className={`${baseClasses} ${borderClass} ${interactiveClasses}`}
        onClick={handleClick}
        onKeyDown={onClick ? handleKeyDown : undefined}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        aria-label={ariaLabel}
      >
        {interview.time && (
          <span className="font-semibold text-gray-800">{interview.time}</span>
        )}
        {interview.time && (
          <span className="text-gray-300" aria-hidden="true">&middot;</span>
        )}
        <CompanyLogo logoUrl={logoUrl} companyName={interview.companyName} size={14} />
        <span className="text-gray-700 truncate max-w-[80px] sm:max-w-[120px] md:max-w-[200px]" title={interview.companyName}>{interview.companyName}</span>

        {hasVideoCallLink ? (
          <button
            type="button"
            onClick={handleVideoIconClick}
            className={`p-0.5 rounded transition focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none ${
              isCallLinkOpen
                ? 'text-blue-700 bg-blue-100'
                : 'text-blue-600 hover:text-blue-800 hover:bg-blue-50'
            }`}
            aria-label={isCallLinkOpen ? 'Hide video call link' : `Show ${interview.companyName} video call link`}
            aria-expanded={isCallLinkOpen}
            title={isCallLinkOpen ? 'Hide call link' : 'Show call link'}
          >
            <InterviewIcon size={14} />
          </button>
        ) : (
          <InterviewIcon size={14} className={`${iconColour} shrink-0`} aria-hidden="true" />
        )}
      </div>

      {/* Join call link — shown below the chip when video icon is toggled */}
      {isCallLinkOpen && hasVideoCallLink && (
        <div className="px-3 py-1">
          <a
            href={trimmedVideoLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 underline focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
            aria-label={`Join ${interview.companyName} video call`}
            title={trimmedVideoLink}
          >
            Join call
            <ExternalLink size={10} aria-hidden="true" />
          </a>
        </div>
      )}
    </div>
  );
}

/**
 * Compact summary strip showing today's upcoming scheduled interviews.
 *
 * Renders a horizontal list of interview chips (time, company, type icon).
 * Hidden entirely when the interviews array is empty.
 *
 * Only one chip's "Join call" panel can be open at a time. Clicking a
 * chip to navigate (onInterviewClick) auto-closes any open panel.
 *
 * @param {{
 *   interviews: Object[],
 *   onInterviewClick?: (interview: Object) => void,
 * }} props
 */
interface TodayInterviewsProps {
  interviews: FlattenedInterview[];
  onInterviewClick?: (interview: FlattenedInterview) => void;
}

export function TodayInterviews({ interviews, onInterviewClick }: TodayInterviewsProps) {
  const [openCallLinkId, setOpenCallLinkId] = useState<string | null>(null);

  if (interviews.length === 0) return null;

  function handleInterviewClick(interview: FlattenedInterview) {
    setOpenCallLinkId(null);
    if (onInterviewClick) onInterviewClick(interview);
  }

  return (
    <div className="mb-6" role="region" aria-label="Today's upcoming interviews">
      <div className="bg-purple-50 border border-purple-300 rounded-lg px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <CalendarCheck size={16} className="text-purple-600" />
          <h2 className="text-sm font-semibold text-purple-800">
            Today&apos;s Interviews
            <span className="ml-1.5 text-xs font-normal text-purple-500">
              ({interviews.length})
            </span>
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {interviews.map((interview) => (
            <TodayInterviewItem
              key={interview.id}
              interview={interview}
              onClick={onInterviewClick ? handleInterviewClick : undefined}
              isCallLinkOpen={openCallLinkId === interview.id}
              onToggleCallLink={() => setOpenCallLinkId((prev) => prev === interview.id ? null : interview.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
