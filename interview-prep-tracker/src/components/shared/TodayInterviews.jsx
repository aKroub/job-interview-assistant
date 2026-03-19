import React, { useState } from 'react';
import { CalendarCheck, ExternalLink, HelpCircle } from 'lucide-react';
import { TYPE_CONFIG } from '../../constants/interviewTypes';
import { resolveCompanyLogoUrl } from '../../utils/companyLogoUtils';
import { isValidVideoCallUrl, sanitizeVideoCallUrl } from '../../utils/urlUtils';
import { CompanyLogo } from './CompanyLogo';

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
 * @param {{ interview: Object, onClick?: (interview: Object) => void }} props
 */
function TodayInterviewItem({ interview, onClick }) {
  const typeConfig = TYPE_CONFIG[interview.type];
  const InterviewIcon = typeConfig ? typeConfig.Icon : HelpCircle;
  const logoUrl = resolveCompanyLogoUrl({
    name: interview.companyName,
    domain: interview.companyDomain,
    customLogoUrl: interview.companyCustomLogoUrl,
  });

  const isVideoInterview = interview.type === 'Video Interview';
  const hasVideoCallLink = isVideoInterview && isValidVideoCallUrl(interview.videoCallLink);
  const trimmedVideoLink = sanitizeVideoCallUrl(interview.videoCallLink);

  const [showJoinCall, setShowJoinCall] = useState(false);

  const baseClasses =
    'flex items-center gap-1.5 bg-white border border-purple-200 rounded-md px-3 py-1.5 text-sm transition';
  const iconColour = typeConfig?.colour || 'text-purple-500';
  const interactiveClasses = onClick
    ? 'cursor-pointer hover:border-purple-400 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-1 active:scale-[0.98]'
    : '';

  function handleClick() {
    if (onClick) onClick(interview);
  }

  function handleKeyDown(e) {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick(interview);
    }
  }

  function handleVideoIconClick(e) {
    e.stopPropagation();
    setShowJoinCall((prev) => !prev);
  }

  const timeLabel = interview.time || 'TBD';
  const ariaLabel = onClick
    ? `View ${interview.companyName} ${interview.type} at ${timeLabel}`
    : undefined;

  return (
    <div className="flex flex-col">
      <div
        className={`${baseClasses} ${interactiveClasses}`}
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
              showJoinCall
                ? 'text-blue-700 bg-blue-100'
                : 'text-blue-600 hover:text-blue-800 hover:bg-blue-50'
            }`}
            aria-label={showJoinCall ? 'Hide video call link' : `Show ${interview.companyName} video call link`}
            aria-expanded={showJoinCall}
            title={showJoinCall ? 'Hide call link' : 'Show call link'}
          >
            <InterviewIcon size={14} />
          </button>
        ) : (
          <InterviewIcon size={14} className={`${iconColour} shrink-0`} aria-hidden="true" />
        )}
      </div>

      {/* Join call link — shown below the chip when video icon is toggled */}
      {showJoinCall && hasVideoCallLink && (
        <div className="ml-3 mt-1">
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
 * @param {{
 *   interviews: Object[],
 *   onInterviewClick?: (interview: Object) => void,
 * }} props
 */
export function TodayInterviews({ interviews, onInterviewClick }) {
  if (interviews.length === 0) return null;

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
              onClick={onInterviewClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
