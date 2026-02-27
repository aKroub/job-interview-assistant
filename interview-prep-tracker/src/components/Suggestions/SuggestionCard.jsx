import React from 'react';
import { Calendar, Mail, Building2, X, CalendarPlus } from 'lucide-react';
import { TYPE_CONFIG } from '../../constants/interviewTypes';

/**
 * A single interview suggestion card.
 *
 * Displays the detected company, interview type, date/time, subject line,
 * and email snippet. Clicking the card (or the "Schedule" button) triggers
 * onAccept; the dismiss × button removes the suggestion.
 *
 * Email-only suggestions (source: 'gmail') render with an amber theme and
 * a "Not on your calendar" badge so the user knows the event was detected
 * from email only and has not been added to their calendar yet.
 *
 * @param {{
 *   suggestion:  Object,
 *   onDismiss:   (suggestion: Object) => void,
 *   onAccept:    (suggestion: Object) => void,
 * }} props
 */
export function SuggestionCard({ suggestion, onDismiss, onAccept }) {
  const { Icon, colour } = TYPE_CONFIG[suggestion.type] ?? { Icon: Calendar, colour: 'text-gray-600' };
  const isEmailOnly = suggestion.source === 'gmail';

  function handleCardClick() {
    onAccept(suggestion);
  }

  function handleDismissClick(e) {
    e.stopPropagation();
    onDismiss(suggestion);
  }

  return (
    <div
      className={`${isEmailOnly ? 'bg-amber-50 border-amber-200 hover:border-amber-400' : 'bg-white border-purple-200 hover:border-purple-400'} border rounded-lg p-4 shadow-sm flex flex-col gap-2 cursor-pointer hover:shadow-md transition`}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleCardClick(); }}
      aria-label={`Schedule ${suggestion.companyName} interview`}
    >

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
          onClick={handleDismissClick}
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

      {/* Email-only badge */}
      {isEmailOnly && (
        <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 rounded px-2 py-0.5 w-fit">
          <Mail size={12} className="shrink-0" />
          <span>Not on your calendar</span>
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
        <p className={`text-xs text-gray-500 line-clamp-2 border-l-2 ${isEmailOnly ? 'border-amber-200' : 'border-purple-200'} pl-2`}>
          {suggestion.emailSnippet}
        </p>
      )}

      {/* Footer: confidence + schedule button */}
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-gray-400">
          {Number.isFinite(suggestion.confidence) ? Math.round(suggestion.confidence * 100) : 0}% confidence
        </span>
        <span className="flex items-center gap-1 text-xs font-medium text-purple-600">
          <CalendarPlus size={13} />
          Schedule
        </span>
      </div>
    </div>
  );
}
