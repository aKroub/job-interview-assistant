/**
 * Shared mock token store for backend tests.
 *
 * Mirrors the real tokenStore interface (getDismissed, addDismissed,
 * clearDismissed) without disk I/O. Accepts either plain string IDs
 * (backward compat) or objects with { id, emailId, calendarId }.
 *
 * @param {Array<string | { id: string, emailId?: string, calendarId?: string }>} [dismissed=[]]
 * @returns {{ getDismissed: Function, addDismissed: Function, clearDismissed: Function, _getRecords: Function }}
 */
export function createMockTokenStore(dismissed = []) {
  let records = [...dismissed];

  return {
    getDismissed: () => {
      const ids = new Set();
      const emailIds = new Set();
      const calendarIds = new Set();
      for (const entry of records) {
        if (typeof entry === 'string') {
          ids.add(entry);
        } else {
          ids.add(entry.id);
          if (entry.emailId) emailIds.add(entry.emailId);
          if (entry.calendarId) calendarIds.add(entry.calendarId);
        }
      }
      return { ids, emailIds, calendarIds };
    },
    addDismissed: async (entry) => { records.push(entry); },
    clearDismissed: async () => { records = []; },
    /** Test-only: inspect raw dismissed records. */
    _getRecords: () => records,
  };
}
