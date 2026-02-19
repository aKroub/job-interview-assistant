import React from 'react';
import { Clock, Building2 } from 'lucide-react';
import { deriveInterviewStatus } from '../../utils/companyUtils';

/** Tailwind class sets for each display status (matches InterviewRow pattern). */
const STATUS_STYLES = {
  scheduled: 'bg-blue-50   border-blue-300   text-blue-700',
  passed:    'bg-orange-50 border-orange-300 text-orange-700',
  completed: 'bg-green-50  border-green-300  text-green-700',
  cancelled: 'bg-red-50    border-red-300    text-red-700',
};

/** Options for the manual status dropdown (excludes derived 'passed'). */
const STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

/**
 * Compact interview card for use inside a calendar day column.
 *
 * Displays time (prominent), company name, interview type, and a derived
 * status badge. Includes a manual status override dropdown.
 *
 * @param {{
 *   interview:      Object,
 *   onUpdateStatus: (companyId: string, interviewId: string, status: string) => void,
 * }} props
 */
export function InterviewCard({ interview, onUpdateStatus }) {
  const displayStatus = deriveInterviewStatus(interview);
  const statusStyle   = STATUS_STYLES[displayStatus] ?? STATUS_STYLES.scheduled;

  return (
    <div className="bg-white rounded-md border border-gray-200 p-2 shadow-sm hover:shadow transition">
      {/* Time */}
      {interview.time && (
        <div className="flex items-center gap-1 text-sm font-semibold text-gray-800 mb-1">
          <Clock size={12} className="text-gray-500" />
          {interview.time}
        </div>
      )}

      {/* Company name */}
      <div className="flex items-center gap-1 mb-1">
        <Building2 size={12} className="text-blue-500 shrink-0" />
        <span className="text-xs font-medium text-gray-800 truncate">
          {interview.companyName}
        </span>
      </div>

      {/* Interview type */}
      {interview.type && (
        <p className="text-xs text-gray-500 mb-1 truncate">{interview.type}</p>
      )}

      {/* Status badge + dropdown */}
      <div className="flex items-center justify-between gap-1">
        <span className={`px-1.5 py-0.5 text-xs rounded border font-medium capitalize ${statusStyle}`}>
          {displayStatus}
        </span>
        <select
          value={interview.status}
          onChange={(e) => onUpdateStatus(interview.companyId, interview.id, e.target.value)}
          className="px-1 py-0.5 text-xs border border-gray-300 rounded text-gray-600"
          aria-label={`Update status for ${interview.companyName} interview`}
        >
          {STATUS_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
