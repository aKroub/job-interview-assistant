# CLAUDE.md — Interview Prep Tracker

This file is read automatically by Claude Code at the start of every session.
It captures the project conventions, architecture, and workflow rules established so far.

---

## Project Overview

A React app for tracking job applications (Kanban pipeline), scheduling interviews (timeline), and practising system design questions (prep content view).

- **Root:** `/Users/ayal.kroub/privateRepositories/job-interview-assistant/`
- **App:** `interview-prep-tracker/` (Create React App)
- **Entry point:** `src/InterviewPrepTracker.jsx` → `src/App.js` → `src/index.js`

---

## Tech Stack

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20 (via nvm) | Always `nvm use 20` before running any npm command |
| React | 19 | Hooks-based, no class components |
| Tailwind CSS | v3 | v4 is incompatible with react-scripts 5 |
| react-scripts | 5.0.1 | CRA — do not eject |
| lucide-react | latest | Icon library |
| Testing Library | @testing-library/react + dom + user-event | Node 20 required for dom v10 |

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

---

## Quality Gates (enforced before every commit)

```bash
# Always run from the app directory:
cd interview-prep-tracker

# 1. Build — must be clean
npm run build

# 2. Tests — all must pass, results must be shown
npm test -- --watchAll=false --verbose
```

Zero tolerance for warnings in the build output. Fix them, don't suppress them.

---

## Pre-Merge Checklist

Before opening any PR, confirm every item:

- [ ] `npm run build` → 0 errors, 0 warnings
- [ ] `npm test -- --watchAll=false --verbose` → all pass
- [ ] No inner component functions defined inside a component's render scope
- [ ] All state mutations flow through hooks — nothing imports storage directly in components
- [ ] New logic is covered by tests; immutability is asserted where applicable
- [ ] Branch is named `feature/<short-description>`
- [ ] No `TODO`, placeholder, or incomplete code left in

---

## Architecture — Layered (bottom-up dependency order)

```
src/
├── constants/          Static data — no logic, no React
│   ├── questions.js    SYSTEM_DESIGN_QUESTIONS (the full question bank)
│   └── stages.js       STAGES array + STAGE_LABELS map
│
├── services/           I/O abstractions — no React, injectable in tests
│   └── storageService.js   localStorageService + createMemoryStorage()
│
├── utils/              Pure functions — no React, no globals, no side effects
│   ├── companyUtils.js
│   └── questionUtils.js
│
├── hooks/              React state + persistence (inject storage via param)
│   ├── useCompanies.js
│   ├── useSeenQuestions.js
│   └── useInterviewTracker.js   ← thin composition of the two above
│
├── components/         Presentational — receive props, call callbacks, own no global state
│   ├── shared/
│   │   ├── DifficultyBadge.jsx
│   │   └── TabNav.jsx
│   ├── AddCompanyModal/
│   ├── KanbanBoard/    (KanbanBoard, KanbanColumn, CompanyCard)
│   ├── TimelineView/   (TimelineView, InterviewRow, AddInterviewForm)
│   └── PrepContentView/(PrepContentView, CompanyQuestionSection, QuestionCard)
│
├── InterviewPrepTracker.jsx   Thin orchestrating shell (~110 lines)
└── App.js                     Renders <InterviewPrepTracker />
```

**The rule:** Each layer may only import from layers below it.
- Components never import hooks or services directly
- Hooks never import components
- Utils never import hooks or components
- Constants never import anything from `src/`

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
- Always handle promise rejections — unhandled rejections crash the process in Node 20
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
- **Local UI state is OK** — ephemeral form state (e.g. `AddInterviewForm`'s open/close) may live in the component; persisted state belongs in hooks
- **Callbacks bubble up** — mutations always flow: component calls prop callback → hook updates state → hook persists to storage

---

## Testing Conventions

### What to test at each layer

| Layer | How to test | Import |
|---|---|---|
| `utils/` | Plain Jest — no React needed | `import { fn } from './utils/...'` |
| `hooks/` | `renderHook` + injected `createMemoryStorage()` | `@testing-library/react` |
| `components/` | `render(...)` with explicit props | `@testing-library/react` |
| Integration | `render(<App />)` smoke tests | `App.test.js` |

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
| Tailwind classes not applying | Tailwind v4 installed instead of v3 | `npm ls tailwindcss` must show v3; reinstall if not |
| `localStorage is not defined` in tests | Hook or component calls `localStorage` directly | Use injected `storage` param + `createMemoryStorage()` in tests |
| `&&=` syntax error in tests | Node version < 18 | Run `nvm use 20` before any npm command |
| `Module not found` after branch switch | `npm install` not re-run | `nvm use 20 && npm install` |
| Component renders stale data | State mutation instead of new object | Return `{ ...obj, field: value }` — never mutate in place |
| Test passes but app crashes | Inner component defined in render | Move component to its own file at module level |

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
# Always run from the app directory
cd interview-prep-tracker

nvm use 20 && npm start                              # dev server
nvm use 20 && npm run build                          # production build (must be clean)
nvm use 20 && npm test -- --watchAll=false --verbose # all tests (must pass before PR)

git checkout -b feature/<name>                       # new branch
git push -u origin feature/<name>                    # push branch
gh pr create --title "..." --body "..."              # open PR
```
