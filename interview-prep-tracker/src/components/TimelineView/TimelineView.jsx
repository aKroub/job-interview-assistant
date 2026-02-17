import React from 'react';
import { Calendar } from 'lucide-react';
import { flattenAndSortInterviews } from '../../utils/companyUtils';
import { AddInterviewForm } from './AddInterviewForm';
import { InterviewRow } from './InterviewRow';

/**
 * Timeline view — shows a schedule-interview panel and the chronological interview list.
 *
 * @param {{
 *   companies:             Object[],
 *   onAddInterview:        (companyId: string, interview: Object) => void,
 *   onUpdateInterviewStatus: (companyId: string, interviewId: string, status: string) => void,
 * }} props
 */
export function TimelineView({ companies, onAddInterview, onUpdateInterviewStatus }) {
  const allInterviews = flattenAndSortInterviews(companies);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Interview Timeline</h2>

      {/* Schedule Interview panel */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <h3 className="font-semibold text-gray-700 mb-3">Schedule Interview</h3>
        <div className="space-y-2">
          {companies.map((company) => (
            <div key={company.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <h4 className="font-medium text-gray-800">{company.name}</h4>
                <p className="text-sm text-gray-600">{company.position}</p>
              </div>
              <AddInterviewForm companyId={company.id} onAdd={onAddInterview} />
            </div>
          ))}
        </div>
      </div>

      {/* Chronological interview list */}
      <div className="space-y-4">
        {allInterviews.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Calendar size={48} className="mx-auto mb-4 opacity-50" />
            <p>No interviews scheduled yet</p>
          </div>
        ) : (
          allInterviews.map((interview) => (
            <InterviewRow
              key={interview.id}
              interview={interview}
              onUpdateStatus={onUpdateInterviewStatus}
            />
          ))
        )}
      </div>
    </div>
  );
}
