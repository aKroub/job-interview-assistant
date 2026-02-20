import { Phone, Video, MapPin } from 'lucide-react';

/**
 * Closed set of interview types available when scheduling an interview.
 * Update this array to add or remove selectable interview types.
 */
export const INTERVIEW_TYPES = [
  'Phone Interview',
  'Video Interview',
  'In-Person Interview',
];

/**
 * Maps interview type strings to icons and colours.
 * Centralised here so it is never duplicated.
 */
export const TYPE_CONFIG = {
  'Phone Interview': { Icon: Phone,  colour: 'text-purple-600'  },
  'Video Interview': { Icon: Video,  colour: 'text-purple-600' },
  'In-Person Interview':{ Icon: MapPin, colour: 'text-green-600' },
};

/**
 * Available duration options (in minutes) for scheduling interviews.
 * Also accepted from backend API when auto-detected from Gmail/Calendar.
 */
export const DURATION_OPTIONS = [30, 45, 60, 90, 120];
