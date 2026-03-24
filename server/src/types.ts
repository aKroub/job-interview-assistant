/**
 * Shared domain types for the interview-tracker backend.
 *
 * These interfaces define the data shapes flowing through services,
 * utils, and routes. Factory functions reference them for parameter
 * and return-type annotations.
 */

import type { Auth } from 'googleapis';
import type { Router, Request, Response, NextFunction, Express } from 'express';

// Re-export commonly used Express types for convenience
export type { Router, Request, Response, NextFunction, Express };

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface AppConfig {
  clientId: string;
  clientSecret: string;
  port: number;
  pollIntervalMs: number;
  emailLookbackDays: number;
  calendarLookaheadDays: number;
  redirectUri: string;
  anthropicApiKey: string;
  llmDryMode: boolean;
  llmModel: string;
  llmMaxConcurrency: number;
  llmMaxRetries: number;
  scanCooldownMs: number;
  logLevel: string;
  corsOrigin: string;
}

// ---------------------------------------------------------------------------
// OAuth Tokens
// ---------------------------------------------------------------------------

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
}

// ---------------------------------------------------------------------------
// Dismissed Records
// ---------------------------------------------------------------------------

export interface DismissedRecord {
  id: string;
  emailId: string;
  calendarId: string;
}

export interface DismissedSets {
  ids: Set<string>;
  emailIds: Set<string>;
  calendarIds: Set<string>;
}

export interface SurfacedRecords {
  emailIds: string[];
  calendarIds: string[];
}

export interface SurfacedSets {
  emailIds: Set<string>;
  calendarIds: Set<string>;
}

// ---------------------------------------------------------------------------
// Token Store
// ---------------------------------------------------------------------------

export interface TokenStore {
  getTokens(): OAuthTokens | null;
  saveTokens(tokens: OAuthTokens): Promise<void>;
  clearTokens(): Promise<void>;
  getDismissed(): DismissedSets;
  addDismissed(entry: string | { id: string; emailId?: string; calendarId?: string }): Promise<void>;
  clearDismissed(): Promise<void>;
  getSurfaced(): SurfacedSets;
  addSurfaced(emailIds?: string[], calendarIds?: string[]): Promise<void>;
  clearSurfaced(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Google Auth
// ---------------------------------------------------------------------------

export interface GoogleAuth {
  getAuthUrl(): string;
  handleCallback(code: string): Promise<void>;
  isAuthenticated(): boolean;
  getAuthClient(): Auth.OAuth2Client;
  disconnect(): Promise<void>;
  verifyState(state: string): boolean;
}

// ---------------------------------------------------------------------------
// Email parsing results
// ---------------------------------------------------------------------------

export type EmailIntent = 'add' | 'cancel' | 'update';

export interface EmailScoreResult {
  score: number;
  matchedKeywords: string[];
}

export interface DateTimeExtraction {
  date: string | null;
  time: string | null;
  duration: number | null;
  allDates: string[];
}

export interface ParsedGmailMessage {
  subject: string;
  snippet: string;
  from: string;
  messageId: string;
}

export interface CalendarDataExtraction {
  date: string;
  startTime: string;
  endTime: string | null;
  duration: number | null;
}

// ---------------------------------------------------------------------------
// Gmail scan result (from gmailService.scanForInterviews)
// ---------------------------------------------------------------------------

export interface EmailResult {
  messageId: string;
  subject: string;
  snippet: string;
  from: string;
  senderEmail: string;
  senderDomain: string;
  companyName: string;
  score: number;
  matchedKeywords: string[];
  extractedDate: string | null;
  extractedTime: string | null;
  extractedDuration: number | null;
  extractedAllDates: string[];
  intent: EmailIntent;
  bodyText: string;
  videoCallLink: string;
  /** Set by LLM enrichment */
  llmInterviewType?: string | null;
}

// ---------------------------------------------------------------------------
// Calendar scan result (from calendarService.scanForInterviews)
// ---------------------------------------------------------------------------

export type CalendarStatus = 'confirmed' | 'cancelled';

export interface CalendarEvent {
  eventId: string;
  summary: string;
  description: string;
  organizerEmail: string;
  startDateTime: string;
  endDateTime: string;
  date: string;
  time: string;
  score: number;
  matchedKeywords: string[];
  reasons: string[];
  videoCallLink: string;
  hasVideoLink: boolean;
  location: string;
  companyName: string;
  calendarStatus: CalendarStatus;
  /** Set by LLM enrichment */
  llmInterviewType?: string | null;
}

// ---------------------------------------------------------------------------
// Calendar event scoring
// ---------------------------------------------------------------------------

export interface CalendarScoreResult {
  score: number;
  matchedKeywords: string[];
  reasons: string[];
}

export interface KeywordMatchResult {
  isMatch: boolean;
  matchedKeywords: string[];
}

export interface CrossReferenceResult {
  isMatch: boolean;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Suggestion (output of interviewDetector.detect)
// ---------------------------------------------------------------------------

export type SuggestionSource = 'gmail+calendar' | 'gmail' | 'calendar';
export type SuggestionAction = 'add' | 'cancel' | 'update';

export interface Suggestion {
  id: string;
  source: SuggestionSource;
  action: SuggestionAction;
  confidence: number;
  companyName: string;
  companyDomain: string;
  type: string;
  date: string;
  time: string;
  duration: number | null;
  previousDate: string;
  subject: string;
  emailSnippet: string;
  calendarEventId: string;
  emailMessageId: string;
  detectedAt: string;
  videoCallLink: string;
}

// ---------------------------------------------------------------------------
// LLM extraction
// ---------------------------------------------------------------------------

export interface LlmEmailExtraction {
  company_name?: string | null;
  date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  intent?: string | null;
  interview_type?: string | null;
}

export interface LlmCalendarExtraction {
  company_name?: string | null;
  interview_type?: string | null;
}

export interface LlmExtractionResult {
  dryModePrompt: string | null;
  extraction: LlmEmailExtraction | LlmCalendarExtraction | null;
}

export interface LlmStats {
  total: number;
  succeeded: number;
  failed: number;
}

export interface LlmExtractor {
  extractFromEmail(
    subject: string,
    body: string,
    senderEmail: string,
    itemId?: string,
  ): Promise<LlmExtractionResult | null>;
  extractFromCalendarEvent(
    summary: string,
    description: string,
    location: string,
    organizerEmail: string,
    itemId?: string,
  ): Promise<LlmExtractionResult | null>;
  getStats(): LlmStats;
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export interface GmailService {
  scanForInterviews(): Promise<EmailResult[]>;
}

export interface CalendarService {
  scanForInterviews(): Promise<CalendarEvent[]>;
}

export interface InterviewDetector {
  detect(): Promise<Suggestion[]>;
}

export interface DriveBackup {
  fileId: string;
  savedAt: string;
}

export interface DriveService {
  saveState(data: Record<string, unknown>): Promise<{ saved: boolean; fileId: string }>;
  loadState(fileId: string): Promise<Record<string, unknown> | null>;
  listBackups(): Promise<{ backups: DriveBackup[] }>;
}

// ---------------------------------------------------------------------------
// Semaphore
// ---------------------------------------------------------------------------

export interface Semaphore {
  acquire(): Promise<void>;
  release(): void;
}

// ---------------------------------------------------------------------------
// Rate Limiter
// ---------------------------------------------------------------------------

export interface RateLimiter {
  isAllowed(ip: string): boolean;
}

export interface DomainValidation {
  valid: boolean;
  reason?: string;
}

// ---------------------------------------------------------------------------
// createApp dependency overrides
// ---------------------------------------------------------------------------

export interface CreateAppDeps {
  config?: AppConfig;
  tokenStore?: TokenStore;
  googleAuth?: GoogleAuth;
  llmExtractor?: LlmExtractor | null;
  detector?: InterviewDetector;
  driveService?: DriveService;
  gmailService?: GmailService;
  calendarService?: CalendarService;
  getUserEmail?: () => Promise<string>;
}

export interface AppInstance {
  app: Express;
  config: AppConfig;
  tokenStore: TokenStore;
  googleAuth: GoogleAuth;
}
