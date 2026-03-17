import React, { useCallback, useState } from 'react';
import {
  getWeekDays,
  getWeekStart,
  groupInterviewsByDate,
  isSameDay,
  isWeekend,
  shiftWeek,
  toDateString,
} from '../../utils/calendarUtils';
import { flattenAndSortInterviews } from '../../utils/companyUtils';
import { AddInterviewModal } from './AddInterviewModal';
import { DayColumn } from './DayColumn';
import { WeekHeader } from './WeekHeader';

/**
 * Weekly calendar view that displays interviews in a Sun–Sat day-column grid.
 *
 * Owns ephemeral UI state (which week is displayed, whether the add-interview
 * modal is open, which interview is being edited). All persisted data and
 * callbacks arrive via props.
 *
 * @param {{
 *   companies:            Object[],
 *   interviewTypes:       string[],
 *   onAddInterview:       (companyId: string, interview: Object) => void,
 *   onDeleteInterview:    (companyId: string, interviewId: string) => void,
 *   onUpdateInterview:    (companyId: string, interviewId: string, updates: Object) => void,
 * }} props
 */
export function CalendarView({ companies, interviewTypes, onAddInterview, onDeleteInterview, onUpdateInterview }) {
  const [currentWeekStart,  setCurrentWeekStart]  = useState(() => getWeekStart(new Date()));
  const [showAddModal,      setShowAddModal]      = useState(false);
  const [editingInterview,  setEditingInterview]   = useState(null);

  const allInterviews    = flattenAndSortInterviews(companies);
  const weekDays         = getWeekDays(currentWeekStart);
  const interviewsByDate = groupInterviewsByDate(allInterviews);
  const today            = new Date();

  // Weekend days with no interviews collapse to narrow markers.
  const collapsedDays = new Set(
    weekDays
      .filter(day => isWeekend(day) && (interviewsByDate.get(toDateString(day)) || []).length === 0)
      .map(day => toDateString(day))
  );

  // Dynamic grid: full-width for normal/occupied days, 48px for collapsed weekends.
  // Uses a CSS custom property so the mobile grid-cols-1 breakpoint still works.
  const weekColsValue = weekDays
    .map(day => collapsedDays.has(toDateString(day)) ? '48px' : '1fr')
    .join(' ');

  const handlePrevWeek = useCallback(() => {
    setCurrentWeekStart((prev) => shiftWeek(prev, -1));
  }, []);

  const handleNextWeek = useCallback(() => {
    setCurrentWeekStart((prev) => shiftWeek(prev, 1));
  }, []);

  const handleToday = useCallback(() => {
    setCurrentWeekStart(getWeekStart(new Date()));
  }, []);

  function handleEditSave(companyId, interviewId, updates) {
    onUpdateInterview(companyId, interviewId, updates);
    setEditingInterview(null);
  }

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

      {/* Day columns grid — dynamic widths on desktop, stacked on mobile */}
      <div
        className="grid grid-cols-1 md:[grid-template-columns:var(--week-cols)] gap-2"
        style={{ '--week-cols': weekColsValue }}
        data-testid="week-grid"
      >
        {weekDays.map((day) => {
          const dateKey    = toDateString(day);
          const interviews = interviewsByDate.get(dateKey) || [];

          return (
            <DayColumn
              key={dateKey}
              date={day}
              interviews={interviews}
              isToday={isSameDay(day, today)}
              isCollapsed={collapsedDays.has(dateKey)}
              onDeleteInterview={onDeleteInterview}
              onEdit={setEditingInterview}
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

      {/* Edit interview modal */}
      {editingInterview && (
        <AddInterviewModal
          companies={companies}
          interviewTypes={interviewTypes}
          onClose={() => setEditingInterview(null)}
          interview={editingInterview}
          onEdit={handleEditSave}
        />
      )}
    </div>
  );
}
