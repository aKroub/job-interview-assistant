import React, { useState, useEffect, useRef } from 'react';
import { Settings, Upload, Download, Check, AlertCircle, Loader, ChevronLeft } from 'lucide-react';

/**
 * Formats a timestamp into a human-readable relative or absolute string.
 *
 * @param {string} isoString - ISO 8601 timestamp
 * @returns {string}
 */
function formatLastSaved(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1)  return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Formats a timestamp into a full date + time string for the version list.
 *
 * @param {string} isoString - ISO 8601 timestamp
 * @returns {string} e.g. "Feb 22, 2026, 10:00 AM"
 */
function formatVersionTimestamp(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Gear icon dropdown for Google Drive cloud backup/restore.
 * Supports multi-version backups with version selection.
 *
 * @param {{
 *   authStatus: 'checking' | 'authenticated' | 'unauthenticated',
 *   syncStatus: 'idle' | 'saving' | 'loading' | 'success' | 'error',
 *   lastSaved:  string | null,
 *   syncError:  string | null,
 *   backups:    Array<{ fileId: string, savedAt: string }>,
 *   onSave:     () => void,
 *   onLoad:     (fileId: string) => void,
 * }} props
 */
export function CloudSyncMenu({ authStatus, syncStatus, lastSaved, syncError, backups, onSave, onLoad }) {
  const [isOpen, setIsOpen]               = useState(false);
  const [showVersionList, setShowVersionList] = useState(false);
  const menuRef = useRef(null);

  const isAuthenticated = authStatus === 'authenticated';
  const isBusy = syncStatus === 'saving' || syncStatus === 'loading';

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
        setShowVersionList(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  function handleLoadVersion(fileId) {
    const confirmed = window.confirm(
      'This will replace all local data with the selected backup. Continue?'
    );
    if (confirmed) {
      setShowVersionList(false);
      onLoad(fileId);
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => { setIsOpen((v) => !v); setShowVersionList(false); }}
        className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition"
        aria-label="Cloud sync settings"
      >
        <Settings size={18} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50 py-2">
          <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Cloud Backup
          </div>

          {!isAuthenticated && (
            <p className="px-3 py-2 text-xs text-gray-400">
              Connect Google to enable cloud backup
            </p>
          )}

          {/* Save button */}
          <button
            onClick={onSave}
            disabled={!isAuthenticated || isBusy}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {syncStatus === 'saving'
              ? <Loader size={15} className="animate-spin text-purple-500" />
              : <Upload size={15} className="text-gray-500" />
            }
            Save to Drive
          </button>

          {/* Load button — toggles version list */}
          {!showVersionList && (
            <button
              onClick={() => setShowVersionList(true)}
              disabled={!isAuthenticated || isBusy}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {syncStatus === 'loading'
                ? <Loader size={15} className="animate-spin text-purple-500" />
                : <Download size={15} className="text-gray-500" />
              }
              Load from Drive
            </button>
          )}

          {/* Version list */}
          {showVersionList && (
            <div>
              <button
                onClick={() => setShowVersionList(false)}
                className="w-full flex items-center gap-1 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition"
              >
                <ChevronLeft size={13} />
                Back
              </button>

              {backups.length === 0 && (
                <p className="px-3 py-2 text-xs text-gray-400">
                  No backups available
                </p>
              )}

              {backups.map((backup, index) => (
                <button
                  key={backup.fileId}
                  onClick={() => handleLoadVersion(backup.fileId)}
                  disabled={isBusy}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <Download size={14} className="text-gray-400 shrink-0" />
                  <span className="truncate">{formatVersionTimestamp(backup.savedAt)}</span>
                  {index === 0 && (
                    <span className="ml-auto shrink-0 text-[10px] font-medium bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">
                      Latest
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Status feedback */}
          <div className="px-3 pt-1 border-t border-gray-100 mt-1">
            {syncStatus === 'success' && (
              <span className="flex items-center gap-1 text-xs text-green-600 py-1">
                <Check size={13} />
                Saved successfully
              </span>
            )}

            {syncStatus === 'error' && syncError && (
              <span className="flex items-center gap-1 text-xs text-red-500 py-1">
                <AlertCircle size={13} />
                {syncError}
              </span>
            )}

            {lastSaved && syncStatus !== 'error' && (
              <span className="block text-xs text-gray-400 py-1">
                Last backup: {formatLastSaved(lastSaved)}
              </span>
            )}

            {!lastSaved && isAuthenticated && syncStatus === 'idle' && (
              <span className="block text-xs text-gray-400 py-1">
                No backup yet
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
