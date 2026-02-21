import React from 'react';
import { CalendarView } from './CalendarView';

/**
 * Timeline view — thin wrapper that delegates to the weekly CalendarView.
 *
 * Preserves the existing props contract so that InterviewPrepTracker does not
 * need any changes.
 *
 * @param {{
 *   companies:               Object[],
 *   interviewTypes:          string[],
 *   onAddInterview:          (companyId: string, interview: Object) => void,
 *   onDeleteInterview:       (companyId: string, interview: Object) => void,
 *   onUpdateInterviewStatus: (companyId: string, interviewId: string, status: string) => void,
 * }} props
 */
export function TimelineView({ companies, interviewTypes, onAddInterview, onDeleteInterview, onUpdateInterviewStatus }) {
  return (
    <CalendarView
      companies={companies}
      interviewTypes={interviewTypes}
      onAddInterview={onAddInterview}
      onDeleteInterview={onDeleteInterview}
      onUpdateInterviewStatus={onUpdateInterviewStatus}
    />
  );
}
