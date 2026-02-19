import React, { useState, useCallback } from 'react';
import { flattenAndSortInterviews } from '../../utils/companyUtils';
import {
  getWeekStart,
  getWeekDays,
  groupInterviewsByDate,
  shiftWeek,
  isSameDay,
  toDateString,
} from '../../utils/calendarUtils';
import { WeekHeader } from './WeekHeader';
import { DayColumn } from './DayColumn';
import { AddInterviewModal } from './AddInterviewModal';

/**
 * Weekly calendar view that displays interviews in a Sun–Sat day-column grid.
 *
 * Owns ephemeral UI state (which week is displayed, whether the add-interview
 * modal is open). All persisted data and callbacks arrive via props.
 *
 * @param {{
 *   companies:               Object[],
 *   interviewTypes:          string[],
 *   onAddInterview:          (companyId: string, interview: Object) => void,
 *   onUpdateInterviewStatus: (companyId: string, interviewId: string, status: string) => void,
 * }} props
 */
export function CalendarView({ companies, interviewTypes, onAddInterview, onUpdateInterviewStatus }) {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getWeekStart(new Date()));
  const [showAddModal,     setShowAddModal]     = useState(false);

  const allInterviews  = flattenAndSortInterviews(companies);
  const weekDays       = getWeekDays(currentWeekStart);
  const interviewsByDate = groupInterviewsByDate(allInterviews);
  const today          = new Date();

  const handlePrevWeek = useCallback(() => {
    setCurrentWeekStart((prev) => shiftWeek(prev, -1));
  }, []);

  const handleNextWeek = useCallback(() => {
    setCurrentWeekStart((prev) => shiftWeek(prev, 1));
  }, []);

  const handleToday = useCallback(() => {
    setCurrentWeekStart(getWeekStart(new Date()));
  }, []);

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Interview Calendar</h2>

      <WeekHeader
        weekStart={currentWeekStart}
        onPrevWeek={handlePrevWeek}
        onNextWeek={handleNextWeek}
        onToday={handleToday}
        onAddClick={() => setShowAddModal(true)}
      />

      {/* Day columns grid — 7 columns on desktop, stacked on mobile */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
        {weekDays.map((day) => {
          const dateKey    = toDateString(day);
          const interviews = interviewsByDate.get(dateKey) || [];

          return (
            <DayColumn
              key={dateKey}
              date={day}
              interviews={interviews}
              isToday={isSameDay(day, today)}
              onUpdateStatus={onUpdateInterviewStatus}
            />
          );
        })}
      </div>

      {/* Add interview modal */}
      {showAddModal && (
        <AddInterviewModal
          companies={companies}
          interviewTypes={interviewTypes}
          onAdd={onAddInterview}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
