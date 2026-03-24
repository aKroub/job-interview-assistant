import { CalendarView } from './CalendarView.js';
import type { Company, Interview, InterviewTypeName } from '../../types';

interface TimelineViewProps {
  companies: Company[];
  interviewTypes: InterviewTypeName[];
  onAddInterview: (companyId: string, interview: Omit<Interview, 'id'>) => void;
  onDeleteInterview: (companyId: string, interviewId: string) => void;
  onUpdateInterview: (companyId: string, interviewId: string, updates: Partial<Interview>) => void;
  highlightedInterviewId: string | null;
  onHighlightComplete: () => void;
}

/**
 * Timeline view — thin wrapper that delegates to the weekly CalendarView.
 */
export function TimelineView({ companies, interviewTypes, onAddInterview, onDeleteInterview, onUpdateInterview, highlightedInterviewId, onHighlightComplete }: TimelineViewProps) {
  return (
    <CalendarView
      companies={companies}
      interviewTypes={interviewTypes}
      onAddInterview={onAddInterview}
      onDeleteInterview={onDeleteInterview}
      onUpdateInterview={onUpdateInterview}
      highlightedInterviewId={highlightedInterviewId}
      onHighlightComplete={onHighlightComplete}
    />
  );
}
