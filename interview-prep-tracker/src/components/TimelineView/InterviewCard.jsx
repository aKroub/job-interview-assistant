import { Clock, ExternalLink, Pencil, Trash2 } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { TYPE_CONFIG } from '../../constants/interviewTypes';
import { deriveInterviewStatus } from '../../utils/companyUtils';
import { resolveCompanyLogoUrl } from '../../utils/companyLogoUtils';
import { CompanyLogo } from '../shared/CompanyLogo';

/** Tailwind class sets for each display status (matches InterviewRow pattern). */
const STATUS_STYLES = {
  scheduled: 'bg-purple-50   border-purple-300   text-purple-700',
  passed:    'bg-orange-50 border-orange-300 text-orange-700',
  completed: 'bg-green-50  border-green-300  text-green-700',
  cancelled: 'bg-red-50    border-red-300    text-red-700',
};

/**
 * Compact interview card for use inside a calendar day column.
 *
 * Displays time + duration, company name, interview type, and a derived
 * status badge. A pencil icon opens the full edit modal via the onEdit
 * callback.
 *
 * For Video Interview type with a valid http(s) video call link, the video
 * icon is clickable. Clicking it reveals the full URL as a link. Clicking
 * the icon again hides the URL (two-step flow to prevent accidental joins).
 *
 * @param {{
 *   interview:              Object,
 *   onDeleteInterview:      (companyId: string, interviewId: string) => void,
 *   onEdit:                 (interview: Object) => void,
 *   highlightedInterviewId: string | null,
 *   onHighlightComplete:    () => void,
 * }} props
 */
export function InterviewCard({ interview, onDeleteInterview, onEdit, highlightedInterviewId, onHighlightComplete }) {
  const displayStatus = deriveInterviewStatus(interview);
  const statusStyle   = STATUS_STYLES[displayStatus] ?? STATUS_STYLES.scheduled;

  const typeConfig = TYPE_CONFIG[interview.type] || {};
  const InterviewIcon = typeConfig.Icon;
  const logoUrl = resolveCompanyLogoUrl({
    name: interview.companyName,
    domain: interview.companyDomain,
    customLogoUrl: interview.companyCustomLogoUrl,
  });

  const trimmedVideoLink = (interview.videoCallLink || '').trim();
  const hasVideoCallLink = interview.type === 'Video Interview'
    && trimmedVideoLink
    && /^https?:\/\//i.test(trimmedVideoLink);

  const [showVideoLink, setShowVideoLink] = useState(false);

  const cardRef = useRef(null);
  const highlightCompleteRef = useRef(onHighlightComplete);
  highlightCompleteRef.current = onHighlightComplete;
  const isHighlighted = interview.id === highlightedInterviewId;

  useEffect(() => {
    if (!isHighlighted) return;
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });

    let cleared = false;
    function handleAnimationEnd() {
      if (cleared) return;
      cleared = true;
      highlightCompleteRef.current?.();
    }

    const el = cardRef.current;
    el?.addEventListener('animationend', handleAnimationEnd);
    // Fallback: clear highlight even if animationend never fires
    // (e.g. prefers-reduced-motion disables the animation).
    const fallbackTimer = setTimeout(handleAnimationEnd, 2000);

    return () => {
      el?.removeEventListener('animationend', handleAnimationEnd);
      clearTimeout(fallbackTimer);
    };
  }, [isHighlighted]);

  function handleDelete() {
    if (window.confirm(`Are you sure you want to delete the ${interview.companyName} interview?`)) {
      onDeleteInterview(interview.companyId, interview.id);
    }
  }

  return (
    <div
      ref={cardRef}
      className={`relative bg-white rounded-md border border-gray-200 p-2 shadow-sm hover:shadow transition${isHighlighted ? ' animate-highlight-pulse' : ''}`}
    >

      {/* Action buttons — top-right */}
      <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5">
        <button
          onClick={() => onEdit(interview)}
          className="p-1 rounded hover:bg-purple-50 text-gray-400 hover:text-purple-600 transition"
          aria-label={`Edit ${interview.companyName} interview`}
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={handleDelete}
          className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition"
          aria-label={`Delete ${interview.companyName} interview`}
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Time + duration */}
      {interview.time && (
        <div className="flex items-center gap-1 text-sm font-semibold text-gray-800 mb-1 pr-12">
          <Clock size={12} className="text-gray-500" aria-hidden="true" />
          <span>{interview.time}</span>
          {interview.duration && (
            <span className="text-xs font-normal text-gray-400 whitespace-nowrap">
              ({interview.duration} min)
            </span>
          )}
        </div>
      )}

      {/* Company name + logo */}
      <div className="flex items-center gap-1 mb-1 pr-12">
        {logoUrl && (
          <CompanyLogo logoUrl={logoUrl} companyName={interview.companyName} size={12} />
        )}
        <span className="text-xs font-medium text-gray-800 truncate">
          {interview.companyName}
        </span>
      </div>

      {/* Role / position */}
      {typeof interview.position === 'string' && interview.position !== '' && (
        <p className="text-xs text-gray-600 mb-1 truncate" title={interview.position}>{interview.position}</p>
      )}

      {/* Interview type with icon — video icon toggles call link visibility */}
      {interview.type && (
        <div className="mb-1">
          <div className="flex items-center gap-1">
            {InterviewIcon && (
              hasVideoCallLink ? (
                <button
                  type="button"
                  onClick={() => setShowVideoLink((prev) => !prev)}
                  className={`p-1 rounded transition focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none ${
                    showVideoLink
                      ? 'text-blue-700 bg-blue-100'
                      : 'text-blue-600 hover:text-blue-800 hover:bg-blue-50'
                  }`}
                  aria-label={showVideoLink ? 'Hide video call link' : `Show ${interview.companyName} video call link`}
                  aria-expanded={showVideoLink}
                  title={showVideoLink ? 'Hide call link' : 'Show call link'}
                >
                  <InterviewIcon size={12} />
                </button>
              ) : (
                <InterviewIcon size={12} className={`${typeConfig.colour || 'text-purple-500'} shrink-0`} aria-hidden="true" />
              )
            )}
            <span className="text-xs text-gray-500 truncate">{interview.type}</span>
          </div>

          {/* Expanded video call link */}
          {showVideoLink && hasVideoCallLink && (
            <div className="mt-1 flex items-center gap-1 pl-4">
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
      )}

      {/* Status badge */}
      <div className="flex items-center gap-1">
        <span className={`px-1.5 py-0.5 text-xs rounded border font-medium capitalize ${statusStyle}`}>
          {displayStatus}
        </span>
      </div>
    </div>
  );
}
