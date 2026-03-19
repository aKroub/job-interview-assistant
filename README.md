# Interview Prep Tracker

A full-stack interview preparation and job application tracking tool. A React frontend provides a Kanban pipeline, weekly calendar, and system design prep view. A companion Express backend auto-detects interview invitations by cross-referencing Gmail and Google Calendar.

## Features

### 🎯 Pipeline Management (Kanban Board)
- Visual kanban board to track companies through your interview pipeline
- Six active stages: Interested → Applied → CV Screening → Technical → HR → Offer, plus a collapsible "Closed" row below the board
- Stage changes via drag-and-drop between columns
- **Company logos** displayed on cards, interview cards, suggestions, and prep sections
- **Searchable company dropdown** with 45 pre-loaded companies and their logos
- Add custom companies with domain-based logo fetching or manual upload
- **Edit company cards** — click the pencil icon to change position, stage, or pipeline
- Track position titles and company names
- Easy company deletion

### 📅 Interview Calendar
- **Today's Interviews** summary strip above the tabs — shows today's upcoming scheduled interviews as compact chips with time, company name, and type icon; click a chip to jump to the Timeline view, auto-scroll to the correct week, and highlight the interview card with a purple pulse
- Weekly calendar view (Sun–Sat) with day columns and interview cards
- Navigate between weeks with prev / next / today buttons
- Schedule interviews with type (Phone, Video, In-Person), date, time, duration, and optional video call link
- **Video call links** on Video Interview cards — click the video icon to reveal a "Join call" link (two-step toggle to prevent accidental joins); URLs extracted from Google Calendar (`hangoutLink` / `conferenceData`) or Gmail (Zoom, Meet, Teams, WebEx URLs), or entered manually
- Dynamic icons per interview type
- Status tracking: Scheduled, Completed, Cancelled — plus auto-derived "Passed" for past-scheduled interviews
- Delete interviews directly from the calendar
- See all interviews across all companies at a glance

### 📚 Interview Prep Content
- Curated system design questions from Google, Microsoft, and Facebook
- Each company shows 3 fresh questions at a time
- Direct links to YouTube video solutions
- Mark questions as "seen" to get new recommendations
- Progress tracking showing completed questions per company
- Difficulty levels for each question (Easy, Medium, Hard)
- Reset options when you've completed all questions

### 🤖 Smart Interview Suggestions (Backend)
- Connects to Gmail and Google Calendar via OAuth
- Auto-detects interview invitations by cross-referencing both sources
- Optional LLM enrichment (Claude) extracts company names, dates, times, and interview types with per-field fallback to regex
- Resilient API integration: extraction cache (dedup LLM calls across polls), circuit breaker (skip LLM during outages), concurrency limiter, SDK-level retry with exponential backoff, and structured request/response logging
- Self-rescheduling poll loop prevents overlapping async scans
- Manual scan cooldown prevents API overload from repeated requests
- Real-time updates via Server-Sent Events (SSE)
- Dismiss suggestions or trigger manual scans
- Reset all dismissed and accepted suggestions to re-evaluate from scratch
- Connection status indicator in the header

### 💾 Persistent Storage
- All data persists between sessions using `localStorage`
- Tracks companies, interviews, and seen questions
- No account required — works entirely in your browser

---

## Tech Stack

### Frontend (`interview-prep-tracker/`)

| Tool | Version | Notes |
|---|---|---|
| React | 19 | Hooks-based, functional components only |
| Tailwind CSS | v4 | Utility-first styling, CSS-first config via `@tailwindcss/vite` plugin |
| Vite | 6 | Build tool and dev server (replaced Create React App) |
| Vitest | 3 | Test runner (replaced Jest on the frontend) |
| lucide-react | latest | Icon library (Phone, Video, MapPin, etc.) |
| Node.js | 24 | Required (see `.nvmrc` at repo root) |

### Backend (`server/`)

| Tool | Version | Notes |
|---|---|---|
| Express | 5 | HTTP server + REST + SSE |
| googleapis | 171 | Gmail + Calendar + Drive API client |
| @anthropic-ai/sdk | ^0.78.0 | Claude LLM extraction of interview data |
| dotenv | 16 | Env var loading |
| Jest | 30 | `--experimental-vm-modules` for ESM |
| supertest | 7 | HTTP route testing |
| nodemon | 3 | Dev auto-restart (`npm run dev`) |

---

## Getting Started

### Prerequisites
- Node.js **24+** (install via [nvm](https://github.com/nvm-sh/nvm))
- npm (bundled with Node)
- (Optional) A Google Cloud project for the Gmail + Calendar integration — see `SETUP.md`

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/aKroub/job-interview-assistant.git
cd job-interview-assistant

# 2. Use the correct Node version
nvm use 24

# 3. Install frontend dependencies
cd interview-prep-tracker
npm install

# 4. Install backend dependencies
cd ../server
npm install
cd ..
```

### Running the app

**Frontend only** (no backend features):
```bash
cd interview-prep-tracker
nvm use 24 && npm start
```
The app opens at `http://localhost:3000`.

**Full stack** (frontend + Gmail/Calendar suggestions):
```bash
# Terminal 1 — Backend
cd server
nvm use 24 && npm run dev    # → http://localhost:3001

# Terminal 2 — Frontend
cd interview-prep-tracker
nvm use 24 && npm start       # → http://localhost:3000
```

> For Google OAuth setup, follow the step-by-step guide in `SETUP.md`.

---

## Development

```bash
# --- Frontend (from interview-prep-tracker/) ---
nvm use 24 && npm start                              # dev server with hot reload
nvm use 24 && npm run lint                           # catch unused exports + variables
nvm use 24 && npm run build                          # production build (must be 0 warnings)
nvm use 24 && npm test                                # all tests via Vitest (must pass before PR)

# --- Backend (from server/) ---
nvm use 24 && npm run dev                            # dev server with auto-restart
nvm use 24 && npm run lint                           # catch unused exports + variables
nvm use 24 && npm test                               # all tests (must pass before PR)
```

---

## Project Structure

```
interview-prep-tracker/src/
│
├── constants/                     # Static data — no logic, no React
│   ├── app.js                     # APP_TITLE env var with fallback
│   ├── companies.js               # COMPANY_POOL array + lookup map + aliases
│   ├── interviewTypes.js          # INTERVIEW_TYPES, TYPE_CONFIG, DURATION_OPTIONS
│   ├── pipelines.js               # PIPELINES array + PIPELINE_LABELS map + DEFAULT_PIPELINE
│   ├── positions.js               # POSITIONS array
│   ├── questions.js               # SYSTEM_DESIGN_QUESTIONS (Google / Microsoft / Facebook)
│   └── stages.js                  # STAGES array + STAGE_LABELS map
│
├── services/                      # I/O abstractions — injectable in tests
│   ├── storageService.js          # localStorageService + createMemoryStorage()
│   └── apiService.js              # REST calls + SSE stream to backend
│
├── utils/                         # Pure functions — no React, no globals
│   ├── calendarUtils.js           # getWeekStart, getWeekDays, groupInterviewsByDate, …
│   ├── companyLogoUtils.js        # getCompanyLogoUrl, resolveCompanyLogoUrl, guessDomain
│   ├── companyUtils.js            # createCompany, applyStageUpdate, applyDelete, …
│   ├── imageUtils.js              # normalizeImage (Canvas-based 128×128 PNG conversion)
│   ├── questionUtils.js           # getAvailableQuestions, addSeenQuestion, …
│   └── urlUtils.js                # sanitizeVideoCallUrl, isValidVideoCallUrl
│
├── hooks/                         # React state + persistence
│   ├── useCompanies.js            # Companies + interviews state and mutations
│   ├── useSeenQuestions.js        # Seen questions Set + selectors
│   ├── useInterviewSuggestions.js # SSE connection + auth + suggestion state
│   ├── useCloudSync.js            # Google Drive backup/restore with multi-version support
│   └── useInterviewTracker.js     # Thin composition of the three hooks above
│
├── components/
│   ├── shared/
│   │   ├── CloudSyncMenu.jsx      # Gear icon dropdown for Google Drive backup/restore
│   │   ├── CompanyCombobox.jsx    # Searchable company dropdown with custom company flow
│   │   ├── CompanyLogo.jsx        # Shared logo image (renders nothing if no URL)
│   │   ├── DifficultyBadge.jsx    # Reusable difficulty colour badge
│   │   ├── FieldLabel.jsx         # Form field label component
│   │   ├── FormError.jsx          # Error message display component
│   │   ├── TabNav.jsx             # Three-tab navigation bar
│   │   └── TodayInterviews.jsx    # Today's upcoming interviews summary strip
│   ├── AddCompanyModal/
│   │   └── AddCompanyModal.jsx
│   ├── KanbanBoard/
│   │   ├── KanbanBoard.jsx
│   │   ├── KanbanColumn.jsx
│   │   └── CompanyCard.jsx
│   ├── TimelineView/
│   │   ├── TimelineView.jsx       # Wrapper switching between views
│   │   ├── CalendarView.jsx       # Weekly calendar grid (Sun–Sat)
│   │   ├── WeekHeader.jsx         # Week navigation (prev / next / today)
│   │   ├── DayColumn.jsx          # Single day column with interview cards
│   │   ├── InterviewCard.jsx      # Interview card in the calendar
│   │   └── AddInterviewModal.jsx  # Single-step schedule interview modal
│   ├── PrepContentView/
│   │   ├── PrepContentView.jsx
│   │   ├── CompanyQuestionSection.jsx
│   │   └── QuestionCard.jsx
│   └── Suggestions/
│       ├── SuggestionPanel.jsx    # Panel showing detected interview suggestions
│       ├── SuggestionCard.jsx     # Individual suggestion card
│       └── ConnectionStatus.jsx   # OAuth connection status indicator
│
├── InterviewPrepTracker.jsx       # Orchestrating shell (~370 lines)
├── App.jsx                        # Renders <InterviewPrepTracker />
└── App.test.jsx                   # Integration smoke tests
```

```
server/src/
│
├── config.js                      # Loads + validates env vars
│
├── services/
│   ├── tokenStore.js              # File-based OAuth token + dismissed-IDs storage
│   ├── googleAuth.js              # Google OAuth2 flow
│   ├── gmailService.js            # Scans Gmail for interview-related emails
│   ├── calendarService.js         # Scans Google Calendar for interview events
│   ├── interviewDetector.js       # Cross-references Gmail + Calendar, enriches with LLM extraction
│   ├── llmExtractor.js            # Claude-based extraction of company names, dates, and types from emails/events
│   └── driveService.js            # Google Drive save/load/list for versioned app-state backups
│
├── utils/
│   ├── emailParser.js             # Scores + parses Gmail messages
│   ├── llmEnrichment.js           # Merges LLM-extracted fields into regex results (per-field fallback)
│   └── matchingUtils.js           # Scores + cross-references calendar with emails
│
├── routes/
│   ├── auth.js                    # GET /api/auth/status|url|callback, POST disconnect
│   ├── interviews.js              # GET /api/interviews/suggestions (SSE), POST dismiss|scan|reset
│   ├── logo.js                    # GET /api/logo?domain= (favicon proxy with SSRF protection)
│   └── sync.js                    # GET /api/sync/status|load, POST /api/sync/save (Drive backup)
│
└── index.js                       # createApp(deps) factory + server bootstrap
```

### Architecture rules
- Each layer imports **only from layers below it** — components never import hooks or services
- All components are **fully presentational** — they receive data and callbacks via props and own no global state
- All **business logic lives in `utils/`** as pure functions (no React, no globals)
- All **state and persistence lives in `hooks/`**, which accept an injectable `storage` parameter
- Backend services accept **injectable dependencies** so tests can swap in test doubles

---

## Testing

The test suite covers every layer across both frontend and backend:

### Frontend (53 test suites)

| Layer | Test files | What they test |
|---|---|---|
| Constants | `constants.test.js` | Stage keys, positions, interview types, question bank integrity |
| Services | `storageService.test.js`, `apiService.test.js` | Storage interface, REST calls, SSE stream |
| Utils | `companyUtils.test.js`, `questionUtils.test.js`, `calendarUtils.test.js`, `companyLogoUtils.test.js`, `urlUtils.test.js`, `companyLogoUtils.stress.test.js`, `companyUtils.stress.test.js`, `cancelUpdateStress.test.js` | Pure function unit tests and stress tests (no React) |
| Hooks | `useCompanies.test.js`, `useSeenQuestions.test.js`, `useInterviewSuggestions.test.js`, `useInterviewSuggestions.stress.test.js`, `useInterviewTracker.test.js`, `useCloudSync.test.js` | Hook tests with injected in-memory storage / mock API, stress tests |
| Components | 30 test files (one per component) including `CloudSyncMenu.test.jsx`, `TodayInterviews.test.jsx`, `KanbanBoard.stress.test.jsx`, `TodayInterviews.stress.test.jsx`, `editInterview.stress.test.jsx`, `editCompany.stress.test.jsx`, `highlightInterview.stress.test.jsx`, `videoCallLink.stress.test.jsx`, `videoCallLinkUxFix.stress.test.jsx`, `videoCallIconToggle.stress.test.jsx`, `SuggestionCard.stress.test.jsx`, `depsUpgrade.stress.test.jsx` | Rendering, user interactions, callback wiring, stress tests |
| Integration | `App.test.jsx` | Smoke test — app renders and default view loads |
| Migration | `viteMigration.stress.test.jsx` | Vite/Vitest/Tailwind v4 migration regression tests (env vars, globals isolation, class renames, ESM resolution, Testing Library compatibility) |

### Backend (36 test suites)

| Layer | Test files | What they test |
|---|---|---|
| Config | `config.test.js` | Env var loading + validation |
| Services | `tokenStore.test.js`, `googleAuth.test.js`, `gmailService.test.js`, `calendarService.test.js`, `interviewDetector.test.js`, `interviewDetector.stress.test.js`, `llmExtractor.test.js`, `driveService.test.js` | Business logic with injectable mocks |
| Utils | `emailParser.test.js`, `matchingUtils.test.js`, `llmEnrichment.test.js`, `llmEnrichment.stress.test.js`, `phraseExpansionStress.test.js`, `gcalScoringStress.test.js`, `gcalCancellationRepro.test.js`, `cancelUpdateStress.test.js`, `cancellationEmailRepro.test.js` | Scoring, parsing, LLM enrichment, stress and regression tests |
| Resilience | `llmResilience.stress.test.js`, `llmDuplication.repro.test.js`, `extractionCacheStress.test.js`, `logLevelGating.stress.test.js`, `dismissedLogGating.stress.test.js`, `interviewsRoute.test.js`, `resetSuggestions.stress.test.js`, `llmExtractionImprovements.stress.test.js`, `videoCallLink.stress.test.js`, `depsUpgrade.stress.test.js` | Semaphore deadlock, extraction cache, circuit breaker, log-level gating, dismissed-log gating, scan cooldown, reset races, stats consistency, concurrent error batches, duration computation edge cases, video call URL extraction, Express 5 / Jest 30 / googleapis 171 compatibility |
| Integration | `indexWiring.stress.test.js` | App factory wiring stress tests |
| Routes | `auth.test.js`, `interviews.test.js`, `logo.test.js`, `logo.stress.test.js`, `sync.test.js` | HTTP route tests via supertest |

```bash
# Run all frontend tests (Vitest)
cd interview-prep-tracker
npm test

# Run all backend tests
cd server
npm test
```

Tests never mock `localStorage` globally — they inject a `createMemoryStorage()` instance instead, keeping each test fully isolated.

---

## Usage Guide

### Adding Companies
1. Navigate to the **Pipeline** tab
2. Click **Add Company**
3. Search for a company in the dropdown (45 pre-loaded companies with logos), or type a custom name and follow the "Add custom company" flow to fetch/upload a logo
4. Fill in position and initial stage
5. Click **Add Company** to save

### Managing the Pipeline
- Drag and drop cards between columns to move a company to a different stage
- Click the **✏️** pencil icon on a card to edit its position, stage, or pipeline
- Click the **✕** icon to remove a company

### Scheduling Interviews
1. Go to the **Timeline** tab
2. Click **Schedule Interview**
3. Select a company, then fill in type (Phone, Video, or In-Person), date, time, and optionally a video call link
4. The interview appears in the weekly calendar on the correct day
5. Navigate between weeks with the **◀ ▶** arrows or jump to **Today**
6. Update or delete interviews directly from their cards

### Practising System Design
1. Navigate to the **Prep Content** tab
2. Browse questions from Google, Microsoft, and Facebook (3 at a time per company)
3. Click **Watch** to open the YouTube solution video
4. Click **Mark Seen** once you've completed a question — fresh questions appear automatically
5. Click **Reset** when you've seen all of a company's questions

---

## Customisation

### Adding More Questions
Edit `src/constants/questions.js`:

```js
export const SYSTEM_DESIGN_QUESTIONS = {
  // Add a new company
  Amazon: [
    { id: 'a1', title: 'Design Amazon S3', url: 'https://youtube.com/...', difficulty: 'Hard' },
  ],
  // Or add questions to an existing company
  Google: [
    // ... existing questions ...
    { id: 'g10', title: 'Design Spanner', url: 'https://youtube.com/...', difficulty: 'Hard' },
  ],
};
```

### Changing Pipeline Stages
Edit `src/constants/stages.js`:

```js
export const STAGES = ['interested', 'applied', 'phone', 'technical', 'hr', 'offer', 'rejected'];
export const STAGE_LABELS = { interested: 'Interested', /* ... */ };
```

---

## Future Enhancements

- [ ] Notes section per company
- [ ] Export data as JSON / CSV
- [ ] More question categories (behavioural, coding, etc.)
- [ ] Dark mode
- [ ] Mobile responsive improvements
- [ ] Salary negotiation tracker

---

## Contributing

This project follows a **feature-branch → PR → review → merge** workflow:

1. Create a branch: `git checkout -b feature/<name>`
2. Make changes — build and tests must be clean before committing
3. Open a PR and wait for approval
4. Merge only after approval and CI passes

See `CLAUDE.md` in the repo root for the full development conventions (also used by Claude Code).

---

## License

MIT — feel free to use this for your job search!

---

**Good luck with your interviews! 🚀**
