import { SYSTEM_DESIGN_QUESTIONS } from '../../constants/questions.js';
import { CompanyQuestionSection } from './CompanyQuestionSection.js';
import type { SystemDesignQuestion } from '../../types';

const COMPANIES = Object.keys(SYSTEM_DESIGN_QUESTIONS);

interface PrepContentViewProps {
  getAvailableQuestionsFor: (companyName: string) => SystemDesignQuestion[];
  getTotalSeenFor: (companyName: string) => number;
  onMarkSeen: (questionId: string) => void;
  onResetCompany: (companyName: string) => void;
}

/**
 * Prep resources view — lists system design question sections for each company.
 */
export function PrepContentView({ getAvailableQuestionsFor, getTotalSeenFor, onMarkSeen, onResetCompany }: PrepContentViewProps) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Interview Prep Resources</h2>

      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-purple-800">
          <strong>System Design Practice:</strong> Work through these curated questions from top tech companies.
          Mark questions as &ldquo;seen&rdquo; to get fresh recommendations.
        </p>
      </div>

      {COMPANIES.map((companyName) => (
        <CompanyQuestionSection
          key={companyName}
          companyName={companyName}
          totalQuestions={SYSTEM_DESIGN_QUESTIONS[companyName]!.length}
          totalSeen={getTotalSeenFor(companyName)}
          availableQuestions={getAvailableQuestionsFor(companyName)}
          onMarkSeen={onMarkSeen}
          onReset={onResetCompany}
        />
      ))}
    </div>
  );
}
