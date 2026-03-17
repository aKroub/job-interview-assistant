import React from 'react';
import { CalendarCheck, HelpCircle } from 'lucide-react';
import { TYPE_CONFIG } from '../../constants/interviewTypes';
import { resolveCompanyLogoUrl } from '../../utils/companyLogoUtils';
import { CompanyLogo } from './CompanyLogo';

/**
 * A single compact interview chip within the today strip.
 *
 * Defined at module level (never inside TodayInterviews render scope)
 * to preserve React reconciliation and allow isolated testing.
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

  const timeLabel = interview.time || 'TBD';
  const ariaLabel = onClick
    ? `View ${interview.companyName} ${interview.type} at ${timeLabel}`
    : undefined;

  return (
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
      <InterviewIcon size={14} className={`${iconColour} shrink-0`} aria-hidden="true" />
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
