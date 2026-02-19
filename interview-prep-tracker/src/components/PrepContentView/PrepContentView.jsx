import React from 'react';
import { SYSTEM_DESIGN_QUESTIONS } from '../../constants/questions';
import { CompanyQuestionSection } from './CompanyQuestionSection';

const COMPANIES = Object.keys(SYSTEM_DESIGN_QUESTIONS);

/**
 * Prep resources view — lists system design question sections for each company.
 *
 * @param {{
 *   getAvailableQuestionsFor: (companyName: string) => Object[],
 *   getTotalSeenFor:          (companyName: string) => number,
 *   onMarkSeen:               (questionId: string) => void,
 *   onResetCompany:           (companyName: string) => void,
 * }} props
 */
export function PrepContentView({ getAvailableQuestionsFor, getTotalSeenFor, onMarkSeen, onResetCompany }) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Interview Prep Resources</h2>

      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-purple-800">
          <strong>System Design Practice:</strong> Work through these curated questions from top tech companies.
          Mark questions as "seen" to get fresh recommendations.
        </p>
      </div>

      {COMPANIES.map((companyName) => (
        <CompanyQuestionSection
          key={companyName}
          companyName={companyName}
          totalQuestions={SYSTEM_DESIGN_QUESTIONS[companyName].length}
          totalSeen={getTotalSeenFor(companyName)}
          availableQuestions={getAvailableQuestionsFor(companyName)}
          onMarkSeen={onMarkSeen}
          onReset={onResetCompany}
        />
      ))}
    </div>
  );
}
