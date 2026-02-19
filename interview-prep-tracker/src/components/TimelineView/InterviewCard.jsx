import React, { useState } from 'react';
import { Clock, Building2, Pencil } from 'lucide-react';
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
 * Displays time + duration, company name, interview type, and a derived
 * status badge. A pencil icon toggles the status dropdown for editing.
 *
 * @param {{
 *   interview:      Object,
 *   onUpdateStatus: (companyId: string, interviewId: string, status: string) => void,
 * }} props
 */
export function InterviewCard({ interview, onUpdateStatus }) {
  const [editing, setEditing] = useState(false);

  const displayStatus = deriveInterviewStatus(interview);
  const statusStyle   = STATUS_STYLES[displayStatus] ?? STATUS_STYLES.scheduled;

  function handleStatusChange(e) {
    onUpdateStatus(interview.companyId, interview.id, e.target.value);
    setEditing(false);
  }

  return (
    <div className="bg-white rounded-md border border-gray-200 p-2 shadow-sm hover:shadow transition">
      {/* Time + duration */}
      {interview.time && (
        <div className="flex items-center gap-1 text-sm font-semibold text-gray-800 mb-1">
          <Clock size={12} className="text-gray-500" />
          <span>{interview.time}</span>
          {interview.duration && (
            <span className="text-xs font-normal text-gray-400">
              ({interview.duration} min)
            </span>
          )}
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

      {/* Status badge + pencil edit toggle */}
      <div className="flex items-center justify-between gap-1">
        {editing ? (
          <select
            value={interview.status}
            onChange={handleStatusChange}
            onBlur={() => setEditing(false)}
            autoFocus
            className="px-1 py-0.5 text-xs border border-gray-300 rounded text-gray-600 w-full"
            aria-label={`Update status for ${interview.companyName} interview`}
          >
            {STATUS_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        ) : (
          <>
            <span className={`px-1.5 py-0.5 text-xs rounded border font-medium capitalize ${statusStyle}`}>
              {displayStatus}
            </span>
            <button
              onClick={() => setEditing(true)}
              className="p-0.5 rounded hover:bg-gray-100 transition text-gray-400 hover:text-gray-600"
              aria-label={`Edit status for ${interview.companyName} interview`}
            >
              <Pencil size={12} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
