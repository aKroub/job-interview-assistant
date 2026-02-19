import React from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { formatWeekRange } from '../../utils/calendarUtils';

/**
 * Navigation header for the weekly calendar view.
 *
 * Displays the current week range, forward/backward navigation arrows,
 * a "Today" button to jump to the current week, and a "Schedule Interview"
 * button to open the add-interview modal.
 *
 * @param {{
 *   weekStart:  Date,
 *   onPrevWeek: () => void,
 *   onNextWeek: () => void,
 *   onToday:    () => void,
 *   onAddClick: () => void,
 * }} props
 */
export function WeekHeader({ weekStart, onPrevWeek, onNextWeek, onToday, onAddClick }) {
  const weekLabel = formatWeekRange(weekStart);

  return (
    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
      {/* Navigation */}
      <div className="flex items-center gap-2">
        <button
          onClick={onPrevWeek}
          className="p-1.5 rounded hover:bg-gray-100 transition"
          aria-label="Previous week"
        >
          <ChevronLeft size={20} className="text-gray-600" />
        </button>

        <h3 className="text-lg font-semibold text-gray-800 min-w-[200px] text-center">
          {weekLabel}
        </h3>

        <button
          onClick={onNextWeek}
          className="p-1.5 rounded hover:bg-gray-100 transition"
          aria-label="Next week"
        >
          <ChevronRight size={20} className="text-gray-600" />
        </button>

        <button
          onClick={onToday}
          className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100 transition text-gray-700"
        >
          Today
        </button>
      </div>

      {/* Add interview */}
      <button
        onClick={onAddClick}
        className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition"
      >
        <Plus size={16} />
        Schedule Interview
      </button>
    </div>
  );
}
