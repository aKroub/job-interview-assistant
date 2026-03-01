/**
 * Ordered pipeline stages for a job application.
 * STAGES drives both the Kanban board column order and the stage selector options.
 */
export const STAGES = ['interested', 'applied', 'phone', 'technical', 'hr', 'offer', 'rejected'];

/**
 * The active progression stages shown as Kanban columns (left-to-right flow).
 * Excludes terminal stages like "closed" which are displayed separately.
 *
 * @type {string[]}
 */
export const ACTIVE_STAGES = STAGES.filter((s) => s !== 'rejected');

/**
 * The terminal stage key for processes that are no longer active.
 * Displayed in a separate collapsible row below the active Kanban columns.
 *
 * @type {string}
 */
export const CLOSED_STAGE = 'rejected';

/**
 * Human-readable labels for each stage key.
 */
export const STAGE_LABELS = {
  interested: 'Interested',
  applied:    'Applied',
  phone:      'CV Screening',
  technical:  'Technical',
  hr:         'HR',
  offer:      'Offer',
  rejected:   'Closed',
};
