/**
 * Ordered pipeline stages for a job application.
 * STAGES drives both the Kanban board column order and the stage selector options.
 */
export const STAGES = ['interested', 'applied', 'phone', 'technical', 'final', 'offer', 'rejected'];

/**
 * Human-readable labels for each stage key.
 */
export const STAGE_LABELS = {
  interested: 'Interested',
  applied:    'Applied',
  phone:      'CV Screening',
  technical:  'Technical',
  final:      'Final Round',
  offer:      'Offer',
  rejected:   'Rejected'
};
