import { Check } from 'lucide-react';
import { QuestionCard } from './QuestionCard.js';
import { getCompanyLogoUrl } from '../../utils/companyLogoUtils.js';
import { CompanyLogo } from '../shared/CompanyLogo.js';
import type { SystemDesignQuestion } from '../../types';

interface CompanyQuestionSectionProps {
  companyName: string;
  totalQuestions: number;
  totalSeen: number;
  availableQuestions: SystemDesignQuestion[];
  onMarkSeen: (questionId: string) => void;
  onReset: (companyName: string) => void;
}

/**
 * A card showing the available questions for one company.
 */
export function CompanyQuestionSection({
  companyName,
  totalQuestions,
  totalSeen,
  availableQuestions,
  onMarkSeen,
  onReset,
}: CompanyQuestionSectionProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CompanyLogo
            logoUrl={getCompanyLogoUrl(companyName)}
            companyName={companyName}
            size={24}
          />
          <h3 className="text-xl font-semibold text-gray-800">{companyName}</h3>
        </div>
        <span className="text-sm text-gray-600">
          {totalSeen} / {totalQuestions} completed
        </span>
      </div>

      {availableQuestions.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Check size={32} className="mx-auto mb-2 text-green-600" />
          <p>You&apos;ve seen all available questions! 🎉</p>
          <button
            onClick={() => onReset(companyName)}
            className="mt-3 text-sm text-purple-600 hover:underline"
          >
            Reset {companyName} questions
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {availableQuestions.map((question) => (
            <QuestionCard
              key={question.id}
              question={question}
              onMarkSeen={onMarkSeen}
            />
          ))}
        </div>
      )}
    </div>
  );
}
