import React from 'react';
import { Calendar, Mail, Building2, X, CalendarPlus, XCircle, CalendarClock } from 'lucide-react';
import { TYPE_CONFIG } from '../../constants/interviewTypes';

/**
 * Per-action visual configuration for suggestion cards.
 *
 * Each action ('add', 'cancel', 'update') maps to a set of Tailwind classes,
 * a button label, an icon, and a button colour. The lookup defaults to 'add'
 * when the suggestion has no action field (backward compat).
 */
const ACTION_CONFIG = {
  add: {
    bg: 'bg-white',
    border: 'border-purple-200',
    hoverBorder: 'hover:border-purple-400',
    snippetBorder: 'border-purple-200',
    ButtonIcon: CalendarPlus,
    buttonLabel: 'Schedule',
    buttonColour: 'text-purple-600',
    ariaVerb: 'Schedule',
  },
  cancel: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    hoverBorder: 'hover:border-red-400',
    snippetBorder: 'border-red-200',
    ButtonIcon: XCircle,
    buttonLabel: 'Cancel Interview',
    buttonColour: 'text-red-600',
    ariaVerb: 'Cancel',
  },
  update: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    hoverBorder: 'hover:border-blue-400',
    snippetBorder: 'border-blue-200',
    ButtonIcon: CalendarClock,
    buttonLabel: 'Update Interview',
    buttonColour: 'text-blue-600',
    ariaVerb: 'Update',
  },
};

/**
 * A single interview suggestion card.
 *
 * Displays the detected company, interview type, date/time, subject line,
 * and email snippet. Clicking the card (or the action button) triggers
 * onAccept; the dismiss × button removes the suggestion.
 *
 * The card theme varies by `suggestion.action`:
 *  - 'add' (default): purple theme with "Schedule" button
 *  - 'cancel': red theme with "Cancel Interview" button
 *  - 'update': blue theme with "Update Interview" button
 *
 * Email-only suggestions (source: 'gmail') override to amber theme only
 * when the action is 'add'. Cancel/update email-only cards keep their
 * action-specific theme to preserve the visual signal.
 *
 * @param {{
 *   suggestion:  Object,
 *   onDismiss:   (suggestion: Object) => void,
 *   onAccept:    (suggestion: Object) => void,
 * }} props
 */
export function SuggestionCard({ suggestion, onDismiss, onAccept }) {
  const { Icon, colour } = TYPE_CONFIG[suggestion.type] ?? { Icon: Calendar, colour: 'text-gray-600' };
  const action = suggestion.action || 'add';
  const config = ACTION_CONFIG[action] || ACTION_CONFIG.add;
  const isEmailOnly = suggestion.source === 'gmail';
  const useAmberTheme = isEmailOnly && action === 'add';

  const cardBg = useAmberTheme ? 'bg-amber-50' : config.bg;
  const cardBorder = useAmberTheme ? 'border-amber-200' : config.border;
  const cardHover = useAmberTheme ? 'hover:border-amber-400' : config.hoverBorder;
  const snippetBorderClass = useAmberTheme ? 'border-amber-200' : config.snippetBorder;

  function handleCardClick() {
    onAccept(suggestion);
  }

  function handleDismissClick(e) {
    e.stopPropagation();
    onDismiss(suggestion);
  }

  return (
    <div
      className={`${cardBg} ${cardBorder} ${cardHover} border rounded-lg p-4 shadow-sm flex flex-col gap-2 cursor-pointer hover:shadow-md transition`}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardClick(); } }}
      aria-label={`${config.ariaVerb} ${suggestion.companyName} interview`}
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
      {isEmailOnly && action === 'add' && (
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
        <p className={`text-xs text-gray-500 line-clamp-2 border-l-2 ${snippetBorderClass} pl-2`}>
          {suggestion.emailSnippet}
        </p>
      )}

      {/* Footer: confidence + action button */}
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-gray-400">
          {Number.isFinite(suggestion.confidence) ? Math.round(suggestion.confidence * 100) : 0}% confidence
        </span>
        <span className={`flex items-center gap-1 text-xs font-medium ${config.buttonColour}`}>
          <config.ButtonIcon size={13} />
          {config.buttonLabel}
        </span>
      </div>
    </div>
  );
}
