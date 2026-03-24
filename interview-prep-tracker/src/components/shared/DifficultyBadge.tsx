import type { DifficultyLevel } from '../../types';

/**
 * Color mapping for difficulty levels.
 * Centralised here so it is never duplicated across question-related components.
 */
const DIFFICULTY_STYLES: Record<DifficultyLevel, string> = {
  Hard:   'bg-red-100 text-red-700',
  Medium: 'bg-yellow-100 text-yellow-700',
  Easy:   'bg-green-100 text-green-700',
};

interface DifficultyBadgeProps {
  difficulty: DifficultyLevel;
}

/**
 * A small inline badge that communicates question difficulty with colour.
 */
export function DifficultyBadge({ difficulty }: DifficultyBadgeProps) {
  const colorClasses = DIFFICULTY_STYLES[difficulty] ?? 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-block mt-1 px-2 py-1 text-xs rounded ${colorClasses}`}>
      {difficulty}
    </span>
  );
}
