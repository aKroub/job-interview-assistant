/**
 * Application-wide constants.
 *
 * APP_TITLE is the single source of truth for the app name.
 * It is read from the VITE_TITLE environment variable defined in .env.local.
 */
export const APP_TITLE = import.meta.env.VITE_TITLE || 'Interview Prep Tracker';
