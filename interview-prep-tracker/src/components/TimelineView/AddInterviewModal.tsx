import { useState, useEffect, useRef } from 'react';
import { FieldLabel } from '../shared/FieldLabel.js';
import { FormError } from '../shared/FormError.js';
import { CompanyLogo } from '../shared/CompanyLogo.js';
import { DURATION_OPTIONS, formatDuration } from '../../constants/interviewTypes.js';
import { resolveCompanyLogoUrl } from '../../utils/companyLogoUtils.js';
import { sanitizeVideoCallUrl } from '../../utils/urlUtils.js';
import type { Company, FlattenedInterview, Interview, InterviewTypeName } from '../../types';

interface FormData {
  companyId: string;
  type: string;
  date: string;
  time: string;
  duration: number;
  status: string;
  videoCallUrl: string;
  role: string;
}

const EMPTY_INTERVIEW: FormData = {
  companyId:     '',
  type:          '',
  date:          '',
  time:          '',
  duration:      60,
  status:        'scheduled',
  videoCallUrl:  '',
  role:          '',
};

/** Options for the manual status dropdown (excludes derived 'passed'). */
const STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

/**
 * Modal for scheduling a new interview or editing an existing one.
 *
 * **Add mode** (default): All fields — company, type, date, time, duration —
 * are visible immediately. Validation errors appear only after the first
 * submit attempt.
 *
 * **Edit mode** (when `interview` prop is provided): Company is shown as
 * read-only text, a status dropdown is added, and the submit button reads
 * "Save Changes". On submit, calls `onEdit` instead of `onAdd`.
 *
 * @param {{
 *   companies:      Object[],
 *   interviewTypes: string[],
 *   onAdd:          (companyId: string, interview: Object) => void,
 *   onClose:        () => void,
 *   initialValues?: Object | null,
 *   interview?:     Object | null,
 *   onEdit?:        (companyId: string, interviewId: string, updates: Object) => void,
 * }} props
 */
interface AddInterviewModalProps {
  companies: Company[];
  interviewTypes: InterviewTypeName[];
  onAdd?: (companyId: string, interview: Omit<Interview, 'id'>) => void;
  onClose: () => void;
  initialValues?: Partial<FormData> | null;
  interview?: FlattenedInterview | null;
  onEdit?: (companyId: string, interviewId: string, updates: Partial<Interview>) => void;
}

export function AddInterviewModal({
  companies,
  interviewTypes,
  onAdd,
  onClose,
  initialValues = null,
  interview: editingInterview = null,
  onEdit,
}: AddInterviewModalProps) {
  const isEditMode = editingInterview !== null;

  const [formData, setFormData] = useState(() => {
    if (isEditMode) {
      return {
        companyId:     editingInterview.companyId,
        type:          editingInterview.type || '',
        date:          editingInterview.date || '',
        time:          editingInterview.time || '',
        duration:      editingInterview.duration || 60,
        status:        editingInterview.status || 'scheduled',
        videoCallUrl: editingInterview.videoCallUrl || '',
      };
    }
    return initialValues
      ? { ...EMPTY_INTERVIEW, ...initialValues }
      : EMPTY_INTERVIEW;
  });
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);

  const editLogoUrl = isEditMode
    ? resolveCompanyLogoUrl({
      name: editingInterview.companyName,
      domain: editingInterview.companyDomain ?? undefined,
      customLogoUrl: editingInterview.companyCustomLogoUrl ?? undefined,
    })
    : null;

  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;

    const selector = 'input:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const firstFocusable = modal.querySelector<HTMLElement>(selector);
    if (firstFocusable) firstFocusable.focus();

    function handleTab(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const focusables = [...modal!.querySelectorAll<HTMLElement>(selector)];
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    modal.addEventListener('keydown', handleTab);
    return () => modal.removeEventListener('keydown', handleTab);
  }, []);

  const errors = {
    companyId: !isEditMode && !formData.companyId ? 'Please select a company'    : null,
    type:      !formData.type                     ? 'Interview type is required' : null,
    date:      !formData.date                     ? 'Date is required'           : null,
    time:      !formData.time                     ? 'Time is required'           : null,
  };
  const isValid = !errors.companyId && !errors.type && !errors.date && !errors.time;

  function handleSubmit() {
    setSubmitted(true);
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);

    const safeVideoCallLink = sanitizeVideoCallUrl(formData.videoCallUrl);

    if (isEditMode) {
      onEdit?.(editingInterview.companyId, editingInterview.id, {
        type:          formData.type as InterviewTypeName,
        date:          formData.date,
        time:          formData.time,
        duration:      formData.duration,
        status:        formData.status as Interview['status'],
        videoCallUrl: safeVideoCallLink,
      });
      onClose();
      return;
    }

    const { companyId, videoCallUrl: _raw, ...interviewData } = formData;
    onAdd?.(companyId, { ...interviewData, videoCallUrl: safeVideoCallLink } as Omit<Interview, 'id'>);
    onClose();
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  function update(field: keyof FormData, value: string | number) {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      // Clear video call link when switching away from Video Interview
      if (field === 'type' && value !== 'Video Interview') {
        next.videoCallUrl = '';
      }
      return next;
    });
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="interview-modal-title"
      onClick={handleOverlayClick}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      data-testid="modal-overlay"
    >
      <div ref={modalRef} className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 id="interview-modal-title" className="text-xl font-bold text-gray-800 mb-4">
          {isEditMode ? 'Edit Interview' : 'Schedule Interview'}
        </h3>

        <div className="space-y-4">

          {/* Company — required in add mode, read-only in edit mode */}
          {isEditMode ? (
            <div>
              <FieldLabel>Company</FieldLabel>
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-700" data-testid="edit-company-display">
                <CompanyLogo logoUrl={editLogoUrl} companyName={editingInterview.companyName} size={18} />
                <span>{editingInterview.companyName}{editingInterview.position ? ` — ${editingInterview.position}` : ''}</span>
              </div>
            </div>
          ) : (
            <div>
              <FieldLabel htmlFor="modal-company" required>Company</FieldLabel>
              <select
                id="modal-company"
                value={formData.companyId}
                onChange={(e) => update('companyId', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">Select a company…</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.position}
                  </option>
                ))}
              </select>
              <FormError message={submitted ? errors.companyId : null} />
            </div>
          )}

          {/* Type — required */}
          <div>
            <FieldLabel htmlFor="modal-type" required>Type</FieldLabel>
            <select
              id="modal-type"
              value={formData.type}
              onChange={(e) => update('type', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Select type…</option>
              {interviewTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <FormError message={submitted ? errors.type : null} />
          </div>

          {/* Date — required */}
          <div>
            <FieldLabel htmlFor="modal-date" required>Date</FieldLabel>
            <input
              id="modal-date"
              type="date"
              value={formData.date}
              onChange={(e) => update('date', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <FormError message={submitted ? errors.date : null} />
          </div>

          {/* Time — required */}
          <div>
            <FieldLabel htmlFor="modal-time" required>Time</FieldLabel>
            <input
              id="modal-time"
              type="time"
              value={formData.time}
              onChange={(e) => update('time', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <FormError message={submitted ? errors.time : null} />
          </div>

          {/* Duration — optional, defaults to 60 min */}
          <div>
            <FieldLabel htmlFor="modal-duration">Duration</FieldLabel>
            <select
              id="modal-duration"
              value={formData.duration}
              onChange={(e) => update('duration', Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {DURATION_OPTIONS.map((d) => (
                <option key={d} value={d}>{formatDuration(d)}</option>
              ))}
            </select>
          </div>

          {/* Video Call Link — only for Video Interview type */}
          {formData.type === 'Video Interview' && (
            <div>
              <FieldLabel htmlFor="modal-video-link">Video Call Link</FieldLabel>
              <input
                id="modal-video-link"
                type="url"
                value={formData.videoCallUrl}
                onChange={(e) => update('videoCallUrl', e.target.value)}
                placeholder="https://zoom.us/j/..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          )}

          {/* Status — only in edit mode */}
          {isEditMode && (
            <div>
              <FieldLabel htmlFor="modal-status">Status</FieldLabel>
              <select
                id="modal-status"
                value={formData.status}
                onChange={(e) => update('status', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                {STATUS_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          )}

        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSubmit}
            className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
          >
            {isEditMode ? 'Save Changes' : 'Schedule'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
