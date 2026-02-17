import React from 'react';
import { Building2, Calendar, Clock } from 'lucide-react';

/** Tailwind class sets for each interview status. */
const STATUS_STYLES = {
  completed: 'bg-green-50 border-green-300 text-green-700',
  scheduled: 'bg-blue-50 border-blue-300 text-blue-700',
  cancelled: 'bg-red-50 border-red-300 text-red-700',
};

/**
 * A single row in the interview timeline.
 *
 * @param {{
 *   interview:              Object,
 *   onUpdateStatus:         (companyId: string, interviewId: string, status: string) => void,
 * }} props
 */
export function InterviewRow({ interview, onUpdateStatus }) {
  const statusStyle = STATUS_STYLES[interview.status] ?? STATUS_STYLES.scheduled;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <Building2 size={20} className="text-blue-600" />
            <div>
              <h4 className="font-semibold text-gray-800">{interview.companyName}</h4>
              <p className="text-sm text-gray-600">{interview.position}</p>
            </div>
          </div>

          <div className="ml-8 space-y-1">
            <p className="text-sm font-medium text-gray-700">{interview.type}</p>
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

        <select
          value={interview.status}
          onChange={(e) => onUpdateStatus(interview.companyId, interview.id, e.target.value)}
          className={`px-3 py-1 text-sm rounded border ${statusStyle}`}
          aria-label={`Status for ${interview.companyName} interview`}
        >
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
    </div>
  );
}
