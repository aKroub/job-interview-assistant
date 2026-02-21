import { Building2, Calendar, Clock } from 'lucide-react';
import React from 'react';
import { TYPE_CONFIG } from '../../constants/interviewTypes';
import { deriveInterviewStatus } from '../../utils/companyUtils';

/** Tailwind class sets for each display status (includes derived 'passed'). */
const STATUS_STYLES = {
  scheduled: 'bg-purple-50   border-purple-300   text-purple-700',
  passed:    'bg-orange-50 border-orange-300 text-orange-700',
  completed: 'bg-green-50  border-green-300  text-green-700',
  cancelled: 'bg-red-50    border-red-300    text-red-700',
};

/** Human-readable labels for the manual status dropdown (excludes 'passed' — that's derived). */
const STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

/**
 * A single row in the interview timeline.
 *
 * Derives the display status from the persisted status + datetime so that
 * past-scheduled interviews automatically show as 'Passed'. The user can
 * still manually override via the dropdown (scheduled / completed / cancelled).
 *
 * @param {{
 *   interview:      Object,
 *   onUpdateStatus: (companyId: string, interviewId: string, status: string) => void,
 * }} props
 */
export function InterviewRow({ interview, onUpdateStatus }) {
  const displayStatus = deriveInterviewStatus(interview);
  const statusStyle   = STATUS_STYLES[displayStatus] ?? STATUS_STYLES.scheduled;

  const Icon = TYPE_CONFIG[interview.type] || { Icon: Building2 };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <Icon size={20} className="text-purple-600" />
            <div>
              <h4 className="font-semibold text-gray-800">{interview.companyName}</h4>
              <p className="text-sm text-gray-600">{interview.position}</p>
            </div>
          </div>

          <div className="ml-8 space-y-1">
            {interview.type && (
              <p className="text-sm font-medium text-gray-700">{interview.type}</p>
            )}
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span className="flex items-center gap-1">
                <Calendar size={14} />
                {new Date(interview.date).toLocaleDateString()}
              </span>
              {interview.time && (
                <span className="flex items-center gap-1">
                  <Clock size={14} />
                  {interview.time}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          {/* Derived status badge */}
          <span className={`px-2 py-0.5 text-xs rounded border font-medium capitalize ${statusStyle}`}>
            {displayStatus}
          </span>
          {/* Manual override dropdown */}
          <select
            value={interview.status}
            onChange={(e) => onUpdateStatus(interview.companyId, interview.id, e.target.value)}
            className="px-2 py-1 text-xs border border-gray-300 rounded text-gray-600"
            aria-label={`Update status for ${interview.companyName} interview`}
          >
            {STATUS_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
