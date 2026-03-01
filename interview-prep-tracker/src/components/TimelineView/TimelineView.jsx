import React from 'react';
import { CalendarView } from './CalendarView';

/**
 * Timeline view — thin wrapper that delegates to the weekly CalendarView.
 *
 * Preserves the existing props contract so that InterviewPrepTracker does not
 * need any changes beyond adding the onUpdateInterview prop.
 *
 * @param {{
 *   companies:            Object[],
 *   interviewTypes:       string[],
 *   onAddInterview:       (companyId: string, interview: Object) => void,
 *   onDeleteInterview:    (companyId: string, interviewId: string) => void,
 *   onUpdateInterview:    (companyId: string, interviewId: string, updates: Object) => void,
 * }} props
 */
export function TimelineView({ companies, interviewTypes, onAddInterview, onDeleteInterview, onUpdateInterview }) {
  return (
    <CalendarView
      companies={companies}
      interviewTypes={interviewTypes}
      onAddInterview={onAddInterview}
      onDeleteInterview={onDeleteInterview}
      onUpdateInterview={onUpdateInterview}
    />
  );
}
