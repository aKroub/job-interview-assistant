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

## Component Rules

- **No inner components** — never define a component function inside another component's render scope (breaks reconciliation, kills testability)
- **Props only** — components receive all data and callbacks as props; they never import hooks or call storage directly
- **Local UI state is OK** — ephemeral form state (e.g. `AddInterviewForm`'s open/close) may live in the component; persisted state belongs in hooks
- **Callbacks bubble up** — mutations always flow: component calls prop callback → hook updates state → hook persists to storage

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
# Run from the repo root
cd interview-prep-tracker

# Start dev server
nvm use 20 && npm start

# Production build (must be clean before any PR)
nvm use 20 && npm run build

# Run tests (must all pass before any PR)
nvm use 20 && npm test -- --watchAll=false --verbose

# Create a new feature branch
git checkout -b feature/<name>

# Push and open PR
git push -u origin feature/<name>
gh pr create --title "..." --body "..."
```
