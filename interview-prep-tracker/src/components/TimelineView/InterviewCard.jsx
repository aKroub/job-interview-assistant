import { Check, Clock, ExternalLink, Pencil, Trash2, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { TYPE_CONFIG, formatDuration } from '../../constants/interviewTypes';
import { deriveInterviewStatus } from '../../utils/companyUtils';
import { resolveCompanyLogoUrl } from '../../utils/companyLogoUtils';
import { isValidVideoCallUrl, sanitizeVideoCallUrl } from '../../utils/urlUtils';
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
 * For Video Interview type, the video icon is always clickable. Clicking it
 * toggles an inline panel where the user can see the existing call link
 * (as a "Join call" button) and add or edit the URL via an inline input.
 *
 * @param {{
 *   interview:              Object,
 *   onDeleteInterview:      (companyId: string, interviewId: string) => void,
 *   onEdit:                 (interview: Object) => void,
 *   onUpdateInterview:      (companyId: string, interviewId: string, updates: Object) => void,
 *   highlightedInterviewId: string | null,
 *   onHighlightComplete:    () => void,
 * }} props
 */
export function InterviewCard({ interview, onDeleteInterview, onEdit, onUpdateInterview, highlightedInterviewId, onHighlightComplete }) {
  const displayStatus = deriveInterviewStatus(interview);
  const statusStyle   = STATUS_STYLES[displayStatus] ?? STATUS_STYLES.scheduled;

  const typeConfig = TYPE_CONFIG[interview.type] || {};
  const InterviewIcon = typeConfig.Icon;
  const logoUrl = resolveCompanyLogoUrl({
    name: interview.companyName,
    domain: interview.companyDomain,
    customLogoUrl: interview.companyCustomLogoUrl,
  });

  const isVideoInterview = interview.type === 'Video Interview';
  const trimmedVideoLink = sanitizeVideoCallUrl(interview.videoCallLink);
  const hasVideoCallLink = isVideoInterview && isValidVideoCallUrl(interview.videoCallLink);

  const [showVideoPanel, setShowVideoPanel] = useState(false);
  const [linkDraft, setLinkDraft] = useState('');
  const [linkError, setLinkError] = useState('');
  const linkInputRef = useRef(null);

  function handleToggleVideoPanel() {
    const opening = !showVideoPanel;
    setShowVideoPanel(opening);
    if (opening) {
      setLinkDraft(trimmedVideoLink);
      setLinkError('');
    }
  }

  function handleSaveLink() {
    const trimmed = linkDraft.trim();
    const safeLink = sanitizeVideoCallUrl(trimmed);
    if (trimmed && safeLink === '') {
      setLinkError('URL must start with https://');
      linkInputRef.current?.focus();
      return;
    }
    onUpdateInterview(interview.companyId, interview.id, { videoCallLink: safeLink });
    setShowVideoPanel(false);
  }

  function handleCancelLink() {
    setShowVideoPanel(false);
  }

  // Auto-focus the input when the panel opens
  useEffect(() => {
    if (showVideoPanel && linkInputRef.current) {
      linkInputRef.current.focus();
    }
  }, [showVideoPanel]);

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
              &middot; {formatDuration(interview.duration)}
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

      {/* Interview type with icon — video icon toggles call link panel */}
      {interview.type && (
        <div className="mb-1">
          <div className="flex items-center gap-1">
            {InterviewIcon && (
              isVideoInterview ? (
                <button
                  type="button"
                  onClick={handleToggleVideoPanel}
                  className={`p-1 rounded transition focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none ${
                    showVideoPanel
                      ? 'text-blue-700 bg-blue-100'
                      : hasVideoCallLink
                        ? 'text-blue-600 hover:text-blue-800 hover:bg-blue-50'
                        : 'text-purple-500 hover:text-purple-700 hover:bg-purple-50'
                  }`}
                  aria-label={showVideoPanel ? 'Hide video call panel' : `${hasVideoCallLink ? 'Show' : 'Add'} ${interview.companyName} video call link`}
                  aria-expanded={showVideoPanel}
                  title={showVideoPanel ? 'Hide call link' : hasVideoCallLink ? 'Show call link' : 'Add call link'}
                >
                  <InterviewIcon size={12} />
                </button>
              ) : (
                <InterviewIcon size={12} className={`${typeConfig.colour || 'text-purple-500'} shrink-0`} aria-hidden="true" />
              )
            )}
            <span className="text-xs text-gray-500 truncate">{interview.type}</span>
          </div>

          {/* Expanded video call link panel */}
          {showVideoPanel && isVideoInterview && (
            <div className="mt-1.5 pl-1 space-y-1.5">
              {/* Join call link — only when a valid URL exists */}
              {hasVideoCallLink && (
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
              )}

              {/* Inline URL input */}
              <div className="flex items-center gap-1 flex-wrap">
                <input
                  ref={linkInputRef}
                  type="url"
                  value={linkDraft}
                  onChange={(e) => { setLinkDraft(e.target.value); setLinkError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveLink(); if (e.key === 'Escape') handleCancelLink(); }}
                  placeholder="https://zoom.us/j/..."
                  className={`flex-1 min-w-0 text-xs px-1.5 py-1 border rounded focus:outline-none focus:ring-1 ${
                    linkError ? 'border-red-400 focus:ring-red-400' : 'border-gray-300 focus:ring-blue-400'
                  }`}
                  aria-label="Video call URL"
                  aria-invalid={linkError ? 'true' : undefined}
                />
                <button
                  type="button"
                  onClick={handleSaveLink}
                  className="p-1 rounded text-green-600 hover:bg-green-50 transition"
                  aria-label="Save video call link"
                  title="Save"
                >
                  <Check size={12} />
                </button>
                <button
                  type="button"
                  onClick={handleCancelLink}
                  className="p-1 rounded text-gray-400 hover:bg-gray-100 transition"
                  aria-label="Cancel editing video call link"
                  title="Cancel"
                >
                  <X size={12} />
                </button>
              </div>
              {linkError && (
                <p className="text-xs text-red-500 mt-0.5" role="alert">{linkError}</p>
              )}
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
