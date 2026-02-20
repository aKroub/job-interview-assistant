import React from 'react';
import { Calendar, Mail, Building2, X} from 'lucide-react';
import { TYPE_CONFIG } from '../../constants/interviewTypes';


/**
 * A single interview suggestion card.
 *
 * Displays the detected company, interview type, date/time, subject line,
 * and email snippet. The user can dismiss the suggestion with the × button.
 *
 * @param {{
 *   suggestion:  Object,
 *   onDismiss:   (suggestionId: string) => void,
 * }} props
 */
export function SuggestionCard({ suggestion, onDismiss }) {
  const { Icon, colour } = TYPE_CONFIG[suggestion.type] ?? { Icon: Calendar, colour: 'text-gray-600' };

  return (
    <div className="bg-white border border-purple-200 rounded-lg p-4 shadow-sm flex flex-col gap-2">

      {/* Header: company + type + dismiss */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Building2 size={16} className="text-gray-500 shrink-0" />
          <span className="font-semibold text-gray-900 text-sm truncate">
            {suggestion.companyName}
          </span>
          <span className={`flex items-center gap-1 text-xs font-medium ${colour} shrink-0`}>
            <Icon size={13} />
            {suggestion.type}
          </span>
        </div>
        <button
          onClick={() => onDismiss(suggestion.id)}
          className="text-gray-400 hover:text-red-500 transition shrink-0"
          aria-label={`Dismiss ${suggestion.companyName} suggestion`}
        >
          <X size={16} />
        </button>
      </div>

      {/* Date / time */}
      {(suggestion.date || suggestion.time) && (
        <div className="flex items-center gap-1 text-xs text-gray-600">
          <Calendar size={13} className="shrink-0" />
          <span>
            {suggestion.date}
            {suggestion.time ? ` at ${suggestion.time}` : ''}
          </span>
        </div>
      )}

      {/* Email subject */}
      {suggestion.subject && (
        <div className="flex items-start gap-1 text-xs text-gray-600">
          <Mail size={13} className="shrink-0 mt-0.5" />
          <span className="italic truncate">{suggestion.subject}</span>
        </div>
      )}

      {/* Email snippet */}
      {suggestion.emailSnippet && (
        <p className="text-xs text-gray-500 line-clamp-2 border-l-2 border-purple-200 pl-2">
          {suggestion.emailSnippet}
        </p>
      )}

      {/* Confidence */}
      <div className="text-xs text-gray-400 text-right">
        {Math.round(suggestion.confidence * 100)}% confidence
      </div>
    </div>
  );
}
