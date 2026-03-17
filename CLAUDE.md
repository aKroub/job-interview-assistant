# CLAUDE.md — Interview Prep Tracker

This file is read automatically by Claude Code at the start of every session.
It captures the project conventions, architecture, and workflow rules established so far.

---

## Project Overview

A React app for tracking job applications (Kanban pipeline), scheduling interviews (timeline), and practising system design questions (prep content view). A companion Express backend auto-detects interview invitations by cross-referencing Gmail and Google Calendar.

- **Root:** `/Users/ayal.kroub/privateRepositories/job-interview-assistant/`
- **Frontend:** `interview-prep-tracker/` (Vite + React) — runs on port 3000
- **Backend:** `server/` (Express + Google APIs) — runs on port 3001
- **Frontend entry point:** `src/InterviewPrepTracker.jsx` → `src/App.jsx` → `src/main.jsx`
- **Backend entry point:** `server/src/index.js` (createApp factory)
- **Setup guide:** `SETUP.md` — Google Cloud project setup and first-run instructions

---

## Tech Stack

### Frontend (`interview-prep-tracker/`)

| Tool | Version | Notes |
|---|---|---|
| Node.js | 24 (via nvm) | Always `nvm use 24` before running any npm command |
| React | 19 | Hooks-based, no class components |
| Tailwind CSS | v4 | CSS-first config via `@tailwindcss/vite` plugin — no PostCSS or tailwind.config.js |
| Vite | 6 | Build tool and dev server — replaced Create React App |
| Vitest | 3 | Test runner — replaced Jest on the frontend; shares Vite config |
| lucide-react | latest | Icon library |
| Testing Library | @testing-library/react + dom + user-event v14 | user-event v14 uses async `userEvent.setup()` pattern |

### Backend (`server/`)

| Tool | Version | Notes |
|---|---|---|
| Node.js | 24 (via nvm) | Same version as frontend |
| Express | 5 | HTTP server + REST + SSE |
| googleapis | 171 | Gmail + Calendar + Drive API client |
| @anthropic-ai/sdk | ^0.78.0 | Claude LLM extraction of interview data (optional, dry mode by default) |
| dotenv | 16 | Env var loading |
| Jest | 30 | `--experimental-vm-modules` for ESM |
| supertest | 7 | HTTP route testing |
| nodemon | 3 | Dev auto-restart (`npm run dev`) |

---

## Git Workflow (non-negotiable)

1. **Every feature gets its own branch** — never commit directly to `main`
2. Branch naming: `feature/<short-description>` (e.g. `feature/add-notes-field`)
3. Before opening a PR, verify locally:
   - `npm run build` → must produce **0 errors, 0 warnings**
   - `npm test -- --watchAll=false --verbose` → **all tests must pass**
4. Open a PR for the user's approval
5. **Do not merge** until the user explicitly approves and CI passes
6. PRs are opened against the previous feature branch (chained), or `main` when that branch is already merged
7. **Max ~8 files changed per PR** — keeps diffs reviewable and isolates changes for future debugging
8. **NEVER push directly to `main`** — all changes go through feature branches and PRs. No exceptions.
9. **Merging PRs:** When the user approves a PR, merge it using `gh pr merge <number> --merge --admin`. The `--admin` flag is required because the repo owner cannot self-approve PRs due to GitHub's CODEOWNERS limitation.

---

## Quality Gates (enforced before every commit)

```bash
# Frontend — always run from interview-prep-tracker/
cd interview-prep-tracker
npm run lint                           # no unused exports or variables (0 warnings)
npm run build                          # must be clean (0 errors, 0 warnings)
npm test                               # Vitest — all tests must pass

# Backend — always run from server/
cd server
npm run lint                           # no unused exports or variables (0 warnings)
npm test                               # all tests must pass
```

Zero tolerance for warnings in the build and lint output. Fix them, don't suppress them.

---

## Plan Review (mandatory)

After writing a plan and before calling `ExitPlanMode`, invoke the `review-plan` skill as an **isolated sub-agent** (`context: fork`). The sub-agent independently reviews the plan across all 7 dimensions (simplicity, alternatives, error-prone patterns, UX, backwards compatibility, rollout, architecture) and returns findings with concrete, implementable suggestions.

**Workflow:**
1. Write the plan as usual
2. Before calling `ExitPlanMode`, spawn a sub-agent with the `review-plan` skill and pass it the plan file path
3. The sub-agent returns a structured review with findings and suggested fixes
4. **Fix all BLOCKER and HIGH findings** — apply the sub-agent's suggested plan revisions
5. Fix MEDIUM findings as well unless there's a clear reason to defer
6. Only then call `ExitPlanMode` to present the improved plan to the user

**Skip this step** for trivial plans (single-file changes, obvious fixes, purely mechanical refactors).

---

## Agent Teams for Full-Stack Features

When a feature involves **both frontend and backend development** and is expected to touch **4+ files on each side**, use the `/build-with-agent-team` command to orchestrate a team of agents instead of building sequentially.

**Why:** Frontend and backend work are independently buildable once the API contract (endpoint URLs, request/response shapes, SSE event formats) is defined. A team lets both sides build in parallel, with the lead agent mediating contract changes.

**Workflow:**
1. Plan the feature as usual (plan mode → `review-plan` → `ExitPlanMode`)
2. After the user approves the plan, invoke `/build-with-agent-team [plan-path] 2` (frontend + backend agents)
3. The command handles: contract definition, agent spawning, collaboration, and end-to-end validation

**When to use:**
- Full-stack features touching 4+ files on each side (e.g. new API endpoint + route + service + tests on backend, new hook + component + apiService + tests on frontend)
- Features where the frontend and backend can be built to a shared API contract without constant back-and-forth

**When NOT to use:**
- Single-layer changes (frontend-only or backend-only)
- Small full-stack features (< 4 files per side) — a single agent handles these faster than the team coordination overhead
- Bug fixes — investigation is inherently sequential
- Features where the frontend can't start until the backend is fully built (tight sequential dependency)

---

## Pre-Merge Checklist

Before opening any PR, confirm every item:

- [ ] `npm run lint` (frontend) → 0 warnings
- [ ] `npm run build` (frontend) → 0 errors, 0 warnings
- [ ] `npm test` (frontend, Vitest) → all pass
- [ ] `npm run lint` (backend, if backend files changed) → 0 warnings
- [ ] `npm test` (backend, if backend files changed) → all pass
- [ ] No inner component functions defined inside a component's render scope
- [ ] All state mutations flow through hooks — nothing imports storage directly in components
- [ ] New logic is covered by tests; immutability is asserted where applicable
- [ ] Branch is named `feature/<short-description>`
- [ ] No `TODO`, placeholder, or incomplete code left in
- [ ] All skills in `.claude/skills/` are tracked by git (`git ls-files --others .claude/skills/` returns empty)
- [ ] All PRs target `main` directly (never chain base branches)

---

## Post-PR Review Pipeline (mandatory)

After every PR is created and quality gates pass, run the following skills **in order** before requesting user approval. Each skill (except write-docs) runs as an **isolated sub-agent** with `context: fork` — this prevents cognitive bias between review stages and keeps verbose output contained. Only summaries bubble up to the main session.

### Step 1: UI/UX Review (`ui-ux-improve` skill — sub-agent, forked context)

Invoke the `ui-ux-improve` skill in an isolated sub-agent against the changed components:

1. Audit all changed frontend components and their surrounding UI context
2. Evaluate across all 10 categories: visual hierarchy, consistency, accessibility, responsive design, user feedback, simplicity, performance, typography, color, navigation
3. Classify findings by severity (critical / major / minor)
4. **Fix all findings** rated major or above immediately — commit the fixes to the same branch
5. Fix minor findings as well unless there's a clear reason to defer
6. Push the fixes and re-run quality gates before proceeding

**Skip this step** if the PR contains no frontend/component changes.

### Step 2: Security Review (`security` skill — sub-agent, forked context)

After any UI/UX fixes are committed, invoke the `security` skill in an isolated sub-agent:

1. Scope the PR diff for security-relevant changes (auth, config, tokens, API endpoints, storage, dependencies, LLM integration)
2. Audit against all 6 security categories: credential protection, Google API security, Express endpoint security, LLM integration security, data persistence security, dependency security
3. Classify findings by severity (CRITICAL / HIGH / MEDIUM / LOW)
4. **Fix all findings** rated HIGH or above immediately — commit the fixes to the same branch
5. Fix MEDIUM/LOW findings as well unless there's a clear reason to defer
6. Push the fixes and re-run quality gates before proceeding

**Skip this step** if the PR contains no security-relevant changes (pure UI-only, docs-only, or test-only PRs).

### Step 3: Code Review (`code-review` skill — sub-agent, forked context)

After any security fixes are committed, invoke the `code-review` skill in an isolated sub-agent:

1. Scope the full diff (`git diff main...HEAD`)
2. Read all changed files in full (not just hunks) for context
3. Analyze across all 7 categories: correctness, security, performance, maintainability, testing, simplicity, API
4. Classify findings by severity (CRITICAL / HIGH / MEDIUM / LOW)
5. **Fix all findings** rated HIGH or above immediately — commit the fixes to the same branch
6. Fix MEDIUM/LOW findings as well unless there's a clear reason to defer
7. Push the fixes and re-run quality gates before proceeding

### Step 4: Stress Testing (`debug-mode` skill — sub-agent, forked context)

After the code review fixes are committed, invoke the `debug-mode` skill in an isolated sub-agent:

1. Create an isolated debug branch from the feature branch
2. Generate 3-5 hypotheses about what could break (edge cases, race conditions, data corruption, state bugs)
3. Write stress tests covering all hypotheses — commit them to the debug branch
4. Run the stress tests and analyze results for each hypothesis
5. If any bug is found: reset instrumentation, fix at root cause, verify red-to-green
6. Cherry-pick the stress tests back to the feature branch as permanent regression tests
7. Clean up the debug branch
8. Push and re-run full quality gates

### Step 5: Documentation Audit (`write-docs` skill — main agent, shared context)

After all isolated reviews pass, invoke the `write-docs` skill **in the main agent context** (not forked) with the `audit` operation. This runs in shared context so it can see the full history of what was reviewed, fixed, and tested:

1. Audit all three documentation files (README.md, CLAUDE.md, SETUP.md) against the current codebase
2. Check for gaps introduced by the PR: new files, new dependencies, changed descriptions, updated test counts, new env vars, new APIs
3. Classify findings by severity (HIGH / MEDIUM / LOW)
4. **Fix all findings** — commit the doc updates to the same branch (or a separate `feature/update-docs-*` branch if the PR is already open)
5. Push and re-run quality gates

### Step 6: Skill Version Control

After all reviews pass, check for any new or modified skills that aren't tracked by git:

```bash
# Check for untracked or modified skill files
git ls-files --others --modified .claude/skills/
```

1. If any skill files are untracked or modified, stage them: `git add .claude/skills/<name>/SKILL.md`
2. Commit them to the current branch with message: `chore: track <skill-name> skill in version control`
3. Push the commit

All skills in `.claude/skills/` must be committed to the repo so they are versioned alongside the codebase.

### Why This Order

The pipeline is ordered to maximize independent analysis and minimize bias:

1. **UI/UX first** — catches presentation issues before deeper code analysis
2. **Security second** — runs in isolation so it's not influenced by UI review findings; catches vulnerabilities before general code review
3. **Code review third** — reviews the full codebase quality independently, unbiased by prior security or UI findings
4. **Stress testing fourth** — tests independently without anchoring to any review findings; forms its own hypotheses
5. **Docs last (shared context)** — intentionally runs in shared context so it can document what all prior steps found and fixed

Steps 1-4 run as isolated sub-agents (`context: fork`) to prevent cognitive anchoring between review stages. Step 5 runs in the main agent context because documentation benefits from seeing the full picture.

### Git Operations During the Pipeline

Any step in the pipeline may require non-trivial git operations (rebasing after fixes, resolving conflicts, cherry-picking stress tests, merging branches). For simple operations (`git add`, `git commit`, `git push`), use git directly. For complex operations (rebasing, conflict resolution, cascade syncing, cherry-picking across branches), invoke the **`git-ops` skill** which provides structured safety checks, rollback plans, and conflict resolution workflows.

### Output

All six steps produce a structured summary for the user showing:
- UI/UX audit findings (with severity) and what was fixed
- Security review findings (with severity) and what was fixed
- Code review findings (with severity) and what was fixed
- Hypothesis table with CONFIRMED/REFUTED verdicts
- Documentation audit findings and what was updated
- Any newly tracked skill files
- Final test count and quality gate results

Only after all six steps pass cleanly should the PR be presented to the user for merge approval.

---

## Architecture — Layered (bottom-up dependency order)

### Frontend (`interview-prep-tracker/src/`)

```
src/
├── constants/          Static data — no logic, no React
│   ├── questions.js    SYSTEM_DESIGN_QUESTIONS (the full question bank)
│   ├── stages.js       STAGES array + STAGE_LABELS map
│   ├── pipelines.js    PIPELINES array + PIPELINE_LABELS map + DEFAULT_PIPELINE
│   ├── positions.js    POSITIONS array
│   ├── interviewTypes.js  INTERVIEW_TYPES array + TYPE_CONFIG map + DURATION_OPTIONS
│   ├── companies.js    COMPANY_POOL array + COMPANY_POOL_BY_NAME map + COMPANY_ALIASES
│   └── app.js          APP_TITLE env var with fallback
│
├── services/           I/O abstractions — no React, injectable in tests
│   ├── storageService.js   localStorageService + createMemoryStorage()
│   └── apiService.js       REST calls + SSE stream (injectable fetch/EventSource)
│
├── utils/              Pure functions — no React, no globals, no side effects
│   ├── calendarUtils.js    getWeekDays + isWeekend + date formatting helpers
│   ├── companyUtils.js
│   ├── companyLogoUtils.js  getCompanyLogoUrl + resolveCompanyLogoUrl + guessDomain
│   ├── imageUtils.js        normalizeImage (Canvas-based 128×128 PNG conversion)
│   └── questionUtils.js
│
├── hooks/              React state + persistence (inject storage/api via param)
│   ├── useCompanies.js
│   ├── useSeenQuestions.js
│   ├── useInterviewSuggestions.js   ← SSE + auth + suggestion state
│   ├── useCloudSync.js              ← Google Drive backup/restore with multi-version support
│   └── useInterviewTracker.js       ← thin composition of all three above
│
├── components/         Presentational — receive props, call callbacks, own no global state
│   ├── shared/
│   │   ├── CloudSyncMenu.jsx    ← gear icon dropdown for Google Drive backup/restore
│   │   ├── CompanyCombobox.jsx  ← searchable company dropdown with custom company flow
│   │   ├── CompanyLogo.jsx      ← shared logo image (renders nothing if no URL)
│   │   ├── DifficultyBadge.jsx
│   │   ├── FieldLabel.jsx
│   │   ├── FormError.jsx
│   │   ├── TabNav.jsx
│   │   └── TodayInterviews.jsx  ← today's upcoming interviews summary strip
│   ├── AddCompanyModal/
│   ├── KanbanBoard/    (KanbanBoard, KanbanColumn, CompanyCard)
│   ├── TimelineView/   (TimelineView, CalendarView, WeekHeader, DayColumn,
│   │                     InterviewCard, AddInterviewModal)
│   ├── PrepContentView/(PrepContentView, CompanyQuestionSection, QuestionCard)
│   └── Suggestions/    (SuggestionPanel, SuggestionCard, ConnectionStatus)
│
├── InterviewPrepTracker.jsx   Orchestrating shell (~360 lines)
└── App.jsx                    Renders <InterviewPrepTracker />
```

**The rule:** Each layer may only import from layers below it.
- Components never import hooks or services directly
- Hooks never import components
- Utils never import hooks or components
- Constants never import anything from `src/`

### Backend (`server/src/`)

```
server/src/
├── config.js           Loads + validates env vars, throws on missing required keys
│
├── services/           Injectable business logic — no Express, no globals
│   ├── tokenStore.js       File-based OAuth token + dismissed-IDs storage (~/.interview-tracker/)
│   ├── googleAuth.js       Google OAuth2 flow (getAuthUrl, handleCallback, isAuthenticated)
│   ├── gmailService.js     Scans Gmail for interview-related emails
│   ├── calendarService.js  Scans Google Calendar for interview events
│   ├── interviewDetector.js  Cross-references Gmail+Calendar, enriches with LLM extraction before matching
│   ├── llmExtractor.js     Claude-based extraction with semaphore concurrency control, SDK retry, stats tracking, and structured request/response logging
│   └── driveService.js     Google Drive save/load/list for versioned app-state backups (keeps last 5)
│
├── utils/              Pure functions — no Express, no globals
│   ├── emailParser.js      Scores + parses Gmail messages
│   ├── llmEnrichment.js    Merges LLM-extracted fields into regex results (per-field fallback)
│   └── matchingUtils.js    Scores + cross-references calendar events with emails
│
├── routes/             Express routers — thin HTTP adapters
│   ├── auth.js             GET /api/auth/status|url|callback, POST /api/auth/disconnect
│   ├── interviews.js       GET /api/interviews/suggestions (SSE), POST /dismiss|scan|reset (with scan cooldown)
│   ├── logo.js             GET /api/logo?domain= (favicon proxy with SSRF protection + rate limiting)
│   └── sync.js             GET /api/sync/status|load, POST /api/sync/save (Drive backup/restore)
│
└── index.js            createApp(deps) factory + server bootstrap
```

**Backend injection pattern** — every service accepts injectable dependencies:
```js
// Good — swap in test doubles without touching globals
createGmailService(authClient, { gmailApi: mockGmailApi })
createInterviewDetector({ gmailService, calendarService, tokenStore, llmExtractor, idFn, breakerThreshold, maxCacheSize })
```

### Where does new code go?

```
Is it pure logic with no React?
├─ Yes → utils/  (pure function, testable without React)
└─ No → Does it manage persisted state?
    ├─ Yes → hooks/  (useCompanies, useSeenQuestions, etc.)
    └─ No → Is it ephemeral UI state? (form open/close, hover)
        ├─ Yes → component local state is fine
        └─ No → it's display or a callback → props only, no local state
```

---

## What NOT To Do

These are the most common mistakes — treat each as a hard rule:

- **Never import hooks in a component** — all data and callbacks come via props
- **Never mock `localStorage` in tests** — use `createMemoryStorage()` injected into the hook
- **Never define a component inside another component's render function** — breaks React reconciliation and makes the component untestable in isolation
- **Never hardcode stage names or question data** — use `STAGES`, `STAGE_LABELS`, `SYSTEM_DESIGN_QUESTIONS` from `constants/`
- **Never commit directly to `main`** — always create a `feature/` branch first
- **Never leave `TODO`, placeholder, or half-finished code** — all committed code must be working
- **Never suppress a build warning** — fix the root cause

---

## General Engineering Principles

### Single Responsibility
- Every function does **one thing** — if you need "and" to describe it, split it
- Every file owns one concept: one component, one hook, one util group
- Side effects are **explicit and minimal** — a function that transforms data must not also save to storage; let the caller decide what to do with the result

### DRY (Don't Repeat Yourself)
- Before writing logic, check if a util or constant already covers it
- Shared UI patterns (e.g. difficulty colours) live in a single shared component (`DifficultyBadge`), never inlined in multiple places
- Constants (`STAGES`, `STAGE_LABELS`, `SYSTEM_DESIGN_QUESTIONS`) are the single source of truth — never hardcode their values elsewhere

### Interfaces / Contracts
- Services expose a plain **interface** (an object with a fixed set of methods) rather than a concrete implementation so that the implementation can be swapped in tests or extended later
- The storage interface contract:
  ```js
  { getItem(key: string): string | null, setItem(key: string, value: string): void }
  ```
- Hook return values are the public API of a hook — keep them stable and document every property with JSDoc
- Inject dependencies as **function parameters with defaults**, not as module-level globals:
  ```js
  // Good — caller can override in tests
  export function createCompany(draft, idFn = Date.now) { ... }

  // Bad — untestable, always calls the real Date.now
  export function createCompany(draft) { const id = Date.now(); ... }
  ```

### File & Module Size
- A file that needs to scroll more than one screen to read is a signal to split it
- One React component per file; one logical group of pure functions per util file
- Prefer many small files over few large ones — the architecture already enforces this via the layered folder structure

---

## Performance Best Practices

### Async & Concurrency
- Use `async/await` for all I/O-bound work (network requests, file reads, any future API calls)
- **Never block the event loop** — if a task is CPU-heavy and could run in a worker, note it
- Run independent async operations **concurrently** with `Promise.all`, not sequentially:
  ```js
  // Good — both fetches start immediately, CPU is free while I/O is in flight
  const [companies, questions] = await Promise.all([
    storage.getItem('companies'),
    storage.getItem('seenQuestions'),
  ]);

  // Bad — second fetch waits for first to finish for no reason
  const companies = await storage.getItem('companies');
  const questions = await storage.getItem('seenQuestions');
  ```
- Prefer `Promise.allSettled` when individual failures should not abort the whole batch

### React Performance
- Derive values inside `useMemo` or `useCallback` only when the computation is actually expensive or the reference stability matters for child re-renders — do not add them by default
- Keep state as close to where it is used as possible — global state causes unnecessary re-renders across the tree
- Avoid creating new object/array literals in JSX props (they cause new references on every render); define them outside the component or memoize them

### Data Structures
- Choose the right data structure for the access pattern:
  - `Set` for membership checks (O(1)) — e.g. `seenQuestions`
  - `Map` / object keyed by ID for O(1) lookup by ID — prefer over `.find()` on large arrays
  - Plain arrays only when order matters and lookup is by index

---

## Node.js Best Practices

> These apply whenever writing scripts, CLI tools, or any future backend/server code in this repo.

### Error Handling
- Always handle promise rejections — unhandled rejections crash the process in Node 24
- Use `try/catch` around every `await` that can fail; never swallow errors silently
- Distinguish between operational errors (bad input, network timeout) and programmer errors (null dereference) — operational errors are recoverable, programmer errors are bugs

### Environment & Config
- Never hardcode environment-specific values (URLs, keys, feature flags) — read from environment variables or a config file
- Never commit secrets to the repo — use `.env.local` (already gitignored by CRA)

### Module System
- Use ES Modules (`import`/`export`) throughout — this project is already fully ESM; do not introduce `require()`
- Keep `package.json` dependency list intentional — no unused packages, no mixing of dev and prod dependencies

### Process & Resource Management
- Close connections and clean up listeners in `useEffect` cleanup functions (React) or process `exit` handlers (Node scripts) to avoid resource leaks
- Avoid synchronous file I/O (`fs.readFileSync`) in anything that runs on the hot path — use the async equivalents

---

## React Best Practices

### Hooks
- Custom hooks encapsulate **one concern** each (`useCompanies`, `useSeenQuestions`) — the composing hook (`useInterviewTracker`) contains no logic of its own
- The `useEffect` dependency array must be complete and accurate — do not silence ESLint exhaustive-deps warnings
- For effects that load data on mount, guard against running twice in StrictMode by returning a cleanup function or using a ref flag

### State
- Prefer derived state over duplicated state — if a value can be computed from existing state, compute it rather than storing it separately
- State updates that depend on previous state must use the functional updater form:
  ```js
  // Good
  setCount(prev => prev + 1);

  // Bad — may read a stale value in concurrent mode
  setCount(count + 1);
  ```
- Immutability is mandatory — never mutate state directly; always produce new arrays/objects

### Components
- **No inner components** — never define a component function inside another component's render scope
- **Props only** — components receive all data and callbacks as props; they never import hooks or call storage directly
- **Local UI state is OK** — ephemeral form state (e.g. `AddInterviewModal`'s submitted flag) may live in the component; persisted state belongs in hooks
- **Callbacks bubble up** — mutations always flow: component calls prop callback → hook updates state → hook persists to storage

---

## Testing Conventions

### What to test at each layer

**Frontend:**

| Layer | How to test | Import |
|---|---|---|
| `utils/` | Plain Vitest — no React needed | `import { fn } from './utils/...'` |
| `services/apiService` | Vitest with injectable `fetch` / `EventSource` mock | Plain Vitest |
| `hooks/` | `renderHook` + injected `createMemoryStorage()` or mock API | `@testing-library/react` |
| `components/` | `render(...)` with explicit props | `@testing-library/react` |
| Integration | `render(<App />)` smoke tests | `App.test.jsx` |

**Backend:**

| Layer | How to test | Import |
|---|---|---|
| `utils/` | Plain Jest — no Express needed | `import { fn } from '../src/utils/...'` |
| `services/` | Jest with injectable mock APIs/clocks/stores | `@jest/globals` |
| `routes/` | `supertest` with mock service dependencies | `supertest` |

### Storage injection pattern (never mock localStorage globals)

```js
// In tests — always use this, never jest.spyOn(localStorage, ...)
import { createMemoryStorage } from '../services/storageService';

function setup() {
  const storage = createMemoryStorage();
  const { result } = renderHook(() => useCompanies(storage));
  return { result, storage };
}
```

### API injection pattern (frontend hooks)

```js
// In tests — inject a mock api object, never touch window.fetch or EventSource
function createMockApi(overrides = {}) {
  return {
    fetchAuthStatus: vi.fn().mockResolvedValue({ authenticated: false }),
    createSuggestionStream: vi.fn().mockReturnValue({ onConnected: vi.fn().mockReturnThis(), ... }),
    ...overrides,
  };
}

const { result } = renderHook(() => useInterviewSuggestions(createMockApi()));
```

### Pure function test pattern

```js
// No setup needed — just call the function
import { applyStageUpdate } from '../utils/companyUtils';

it('updates the stage', () => {
  const result = applyStageUpdate([{ id: '1', stage: 'applied' }], '1', 'offer');
  expect(result[0].stage).toBe('offer');
});
```

### Immutability — always test it

Every util function that transforms state should have a test asserting the original input was not mutated.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Tailwind classes not applying | Missing `@import "tailwindcss"` in `index.css` or `@tailwindcss/vite` plugin not in `vite.config.js` | Verify both; Tailwind v4 uses CSS-first config, no `tailwind.config.js` |
| `localStorage is not defined` in tests | Hook or component calls `localStorage` directly | Use injected `storage` param + `createMemoryStorage()` in tests |
| `&&=` syntax error in tests | Node version < 18 | Run `nvm use 24` before any npm command |
| `Module not found` after branch switch | `npm install` not re-run | `nvm use 24 && npm install` |
| Component renders stale data | State mutation instead of new object | Return `{ ...obj, field: value }` — never mutate in place |
| Test passes but app crashes | Inner component defined in render | Move component to its own file at module level |
| `ECONNREFUSED` in browser console | Express server not running | `cd server && nvm use 24 && npm run dev` |
| Jest does not exit after server tests | Open SSE handles | `--forceExit` is already set in `server/package.json` |
| Server starts but crashes instantly | Missing env var | Check `server/.env` — copy from `server/.env.example` |
| OAuth `redirect_uri_mismatch` | Redirect URI not registered | Add `http://localhost:3001/api/auth/callback` in Google Cloud Console |

---

## Code Style

- Named exports for all components and utilities (e.g. `export function KanbanBoard`)
- Default export only for the root `InterviewPrepTracker` component
- JSDoc comments on every exported function describing params and return value
- Injectable parameters default to the real implementation (e.g. `idFn = Date.now`) so callers don't need to pass anything in production
- No hardcoded strings for stage names or company names — always use constants

---

## Common Commands

```bash
# --- Frontend (run from interview-prep-tracker/) ---
nvm use 24 && npm start                              # Vite dev server (port 3000)
nvm use 24 && npm run lint                           # unused exports + variables (must be 0 warnings)
nvm use 24 && npm run build                          # Vite production build (must be 0 warnings)
nvm use 24 && npm test                               # Vitest — all tests (must pass before PR)

# --- Backend (run from server/) ---
nvm use 24 && npm run dev                            # dev server with auto-restart (port 3001)
nvm use 24 && npm start                              # production start
nvm use 24 && npm run lint                           # unused exports + variables (must be 0 warnings)
nvm use 24 && npm test                               # all server tests (must pass before PR)

# --- Git ---
git checkout -b feature/<name>                       # new branch (always from main)
git push -u origin feature/<name>                    # push branch
gh pr create --base main --title "..." --body "..."  # open PR targeting main
```
