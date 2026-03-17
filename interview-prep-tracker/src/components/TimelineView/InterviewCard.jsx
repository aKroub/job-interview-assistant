import { Clock, Pencil, Trash2 } from 'lucide-react';
import React from 'react';
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
 * @param {{
 *   interview:          Object,
 *   onDeleteInterview:  (companyId: string, interviewId: string) => void,
 *   onEdit:             (interview: Object) => void,
 * }} props
 */
export function InterviewCard({ interview, onDeleteInterview, onEdit }) {
  const displayStatus = deriveInterviewStatus(interview);
  const statusStyle   = STATUS_STYLES[displayStatus] ?? STATUS_STYLES.scheduled;

  const typeConfig = TYPE_CONFIG[interview.type] || {};
  const InterviewIcon = typeConfig.Icon;
  const logoUrl = resolveCompanyLogoUrl({
    name: interview.companyName,
    domain: interview.companyDomain,
    customLogoUrl: interview.companyCustomLogoUrl,
  });

  function handleDelete() {
    if (window.confirm(`Are you sure you want to delete the ${interview.companyName} interview?`)) {
      onDeleteInterview(interview.companyId, interview.id);
    }
  }

  return (
    <div className="relative bg-white rounded-md border border-gray-200 p-2 shadow-sm hover:shadow transition">

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

      {/* Company name */}
      <div className="flex items-center gap-1 mb-1 pr-12">
        {logoUrl ? (
          <CompanyLogo logoUrl={logoUrl} companyName={interview.companyName} size={12} />
        ) : InterviewIcon ? (
          <InterviewIcon size={12} className="text-purple-500 shrink-0" />
        ) : null}
        <span className="text-xs font-medium text-gray-800 truncate">
          {interview.companyName}
        </span>
      </div>

      {/* Interview type */}
      {interview.type && (
        <p className="text-xs text-gray-500 mb-1 truncate">{interview.type}</p>
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
