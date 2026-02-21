import React from 'react';
import { Bell, RefreshCw, LogIn, LogOut } from 'lucide-react';
import { SuggestionCard } from './SuggestionCard';

/**
 * Panel that shows interview suggestions detected from Gmail + Calendar.
 *
 * Behaviour by authStatus:
 *   'checking'       → shows a loading spinner
 *   'unauthenticated'→ prompts the user to connect Google
 *   'authenticated'  → shows suggestions list (or empty state)
 *
 * @param {{
 *   suggestions:       Object[],
 *   authStatus:        'checking' | 'authenticated' | 'unauthenticated',
 *   connectionStatus:  'disconnected' | 'connecting' | 'connected' | 'error',
 *   onDismiss:         (suggestionId: string) => void,
 *   onScan:            () => void,
 *   onConnect:         () => void,
 *   onDisconnect:      () => void,
 * }} props
 */
export function SuggestionPanel({
  suggestions,
  authStatus,
  connectionStatus,
  onDismiss,
  onScan,
  onConnect,
  onDisconnect,
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 flex flex-col gap-4">

      {/* Panel header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Bell size={18} className="text-purple-600" />
          Interview Suggestions
        </h2>

        {authStatus === 'authenticated' && (
          <div className="flex items-center gap-2">
            <button
              onClick={onScan}
              className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 transition"
              aria-label="Scan now"
            >
              <RefreshCw size={13} />
              Scan now
            </button>
            <button
              onClick={onDisconnect}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 transition"
              aria-label="Disconnect Google"
            >
              <LogOut size={13} />
              Disconnect
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      {authStatus === 'checking' && (
        <p className="text-sm text-gray-500 text-center py-4">Checking connection…</p>
      )}

      {authStatus === 'unauthenticated' && (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <p className="text-sm text-gray-600">
            Connect your Google account to auto-detect interview invitations
            from Gmail and Calendar.
          </p>
          <button
            onClick={onConnect}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition"
          >
            <LogIn size={15} />
            Connect Google
          </button>
        </div>
      )}

      {authStatus === 'authenticated' && suggestions.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-4">
          {connectionStatus === 'connecting'
            ? 'Scanning Gmail and Calendar…'
            : connectionStatus === 'error'
              ? 'Unable to reach Gmail & Calendar. Retrying…'
              : 'No interview suggestions detected yet.'}
        </p>
      )}

      {authStatus === 'authenticated' && suggestions.length > 0 && (
        <div className="flex flex-col gap-3">
          {suggestions.map((s) => (
            <SuggestionCard key={s.id} suggestion={s} onDismiss={onDismiss} />
          ))}
        </div>
      )}
    </div>
  );
}
