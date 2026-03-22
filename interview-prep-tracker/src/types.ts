/**
 * Core domain types for the Interview Prep Tracker frontend.
 *
 * This is the single source of truth for all shared types across
 * constants, utils, services, hooks, and components.
 */

// ---------------------------------------------------------------------------
// Stage
// ---------------------------------------------------------------------------

export type StageKey =
  | 'interested'
  | 'applied'
  | 'phone'
  | 'technical'
  | 'hr'
  | 'offer'
  | 'rejected';

export type ActiveStageKey = Exclude<StageKey, 'rejected'>;

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export type PipelineId = 'tel-aviv' | 'us';

// ---------------------------------------------------------------------------
// Interview
// ---------------------------------------------------------------------------

export type InterviewTypeName =
  | 'Phone Interview'
  | 'Video Interview'
  | 'In-Person Interview';

export type InterviewStatus = 'scheduled' | 'completed' | 'cancelled';

/** Includes the auto-derived "Passed" status for past-scheduled interviews. */
export type DerivedInterviewStatus = InterviewStatus | 'passed';

export interface Interview {
  id: string;
  type: InterviewTypeName;
  date: string;
  time: string;
  status: InterviewStatus;
  duration?: number;
  videoCallUrl?: string;
  role?: string;
}

export interface InterviewTypeConfig {
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  colour: string;
}

// ---------------------------------------------------------------------------
// Company
// ---------------------------------------------------------------------------

export interface Company {
  id: string;
  name: string;
  position: string;
  stage: StageKey;
  pipeline: PipelineId[];
  interviews: Interview[];
  notes: string;
  createdAt: string;
  domain?: string;
  customLogoUrl?: string;
}

export interface CompanyDraft {
  name: string;
  position: string;
  stage: StageKey;
  pipeline: PipelineId[];
  domain?: string;
  customLogoUrl?: string;
}

export interface FlattenedInterview extends Interview {
  companyName: string;
  position: string;
  companyId: string;
  companyDomain: string | null;
  companyCustomLogoUrl: string | null;
}

// ---------------------------------------------------------------------------
// Company pool (pre-loaded companies)
// ---------------------------------------------------------------------------

export interface CompanyPoolEntry {
  slug: string;
  name: string;
  domain: string;
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export type DifficultyLevel = 'Easy' | 'Medium' | 'Hard';

export interface SystemDesignQuestion {
  id: string;
  title: string;
  url: string;
  difficulty: DifficultyLevel;
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export interface StorageService {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface DriveBackup {
  fileId: string;
  savedAt: string;
}

export interface SuggestionStream {
  onConnected(handler: (data: { status: string }) => void): SuggestionStream;
  onSuggestions(handler: (suggestions: unknown[]) => void): SuggestionStream;
  onScanComplete(handler: (data: { scanned: number }) => void): SuggestionStream;
  onError(handler: (error: { message: string }) => void): SuggestionStream;
  close(): void;
}
