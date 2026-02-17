/**
 * Application-wide constants.
 *
 * APP_TITLE is the single source of truth for the app name.
 * It is read from the REACT_APP_TITLE environment variable so that
 * public/index.html (via %REACT_APP_TITLE%) and the React bundle both
 * stay in sync from a single definition in .env.
 */
export const APP_TITLE = process.env.REACT_APP_TITLE;
