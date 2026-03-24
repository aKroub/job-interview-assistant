import { ExternalLink, Check } from 'lucide-react';
import { DifficultyBadge } from '../shared/DifficultyBadge.js';
import type { SystemDesignQuestion } from '../../types';

interface QuestionCardProps {
  question: SystemDesignQuestion;
  onMarkSeen: (questionId: string) => void;
}

/**
 * A single system-design question row with watch and mark-seen actions.
 */
export function QuestionCard({ question, onMarkSeen }: QuestionCardProps) {
  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
      <div className="flex-1">
        <h4 className="font-medium text-gray-800">{question.title}</h4>
        <DifficultyBadge difficulty={question.difficulty} />
      </div>

      <div className="flex items-center gap-2">
        <a
          href={question.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 px-3 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition"
        >
          <ExternalLink size={16} />
          Watch
        </a>
        <button
          onClick={() => onMarkSeen(question.id)}
          className="flex items-center gap-1 px-3 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 transition"
        >
          <Check size={16} />
          Mark Seen
        </button>
      </div>
    </div>
  );
}
