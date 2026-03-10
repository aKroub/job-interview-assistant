import React from 'react';
import { formatDayHeader, formatFullDate } from '../../utils/calendarUtils';
import { InterviewCard } from './InterviewCard';

/**
 * A single day column in the weekly calendar grid.
 *
 * Renders a day header, interview cards for the day, and a placeholder
 * when no interviews are scheduled. Highlights today's column with a
 * purple accent.
 *
 * @param {{
 *   date:               Date,
 *   interviews:         Object[],
 *   isToday:            boolean,
 *   onDeleteInterview:  (companyId: string, interviewId: string) => void,
 *   onEdit:             (interview: Object) => void,
 * }} props
 */
export function DayColumn({ date, interviews, isToday, onDeleteInterview, onEdit }) {
  const headerLabel = formatDayHeader(date);

  const columnClasses = isToday
    ? 'border-purple-400 bg-purple-50/50'
    : 'border-gray-200 bg-gray-50/30';

  return (
    <div
      className={`rounded-lg border min-h-[140px] flex flex-col ${columnClasses}`}
      aria-label={formatFullDate(date)}
      data-testid={`day-column-${date.getDay()}`}
    >
      {/* Day header */}
      <div
        className={`text-center text-sm font-semibold py-2 border-b ${
          isToday
            ? 'text-purple-700 bg-purple-100 border-purple-300'
            : 'text-gray-600 bg-gray-100 border-gray-200'
        } rounded-t-lg`}
      >
        {headerLabel}
      </div>

      {/* Interview cards or empty placeholder */}
      <div className="flex-1 p-1.5 space-y-1.5">
        {interviews.length === 0 ? (
          <p className="text-xs text-gray-400 text-center mt-4">No interviews</p>
        ) : (
          interviews
            // Sort copies the array and compares the time values
            .slice()
            .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
            .map((interview) => (
              <InterviewCard
                key={interview.id}
                interview={interview}
                onDeleteInterview={onDeleteInterview}
                onEdit={onEdit}
              />
            ))
        )}
      </div>
    </div>
  );
}
