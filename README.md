# Interview Prep Tracker

A full-featured interview preparation and job application tracking tool built with React. Track your application pipeline, schedule interviews, and access curated system design practice questions from top tech companies.

## Features

### 🎯 Pipeline Management (Kanban Board)
- Visual kanban board to track companies through your interview pipeline
- Six stages: Interested → Applied → Phone Screen → Technical → Final Round → Offer
- Quick stage updates via dropdown
- Track position titles and company names
- Easy company deletion

### 📅 Interview Timeline
- Schedule and track all your interviews in one place
- Add interviews with type, date, time, and status
- Visual timeline sorted by date
- Status tracking: Scheduled, Completed, Cancelled
- See all interviews across all companies in chronological order

### 📚 Interview Prep Content
- Curated system design questions from Google, Microsoft, and Facebook
- Each company shows 3 fresh questions at a time
- Direct links to YouTube video solutions
- Mark questions as "seen" to get new recommendations
- Progress tracking showing completed questions per company
- Difficulty levels for each question (Easy, Medium, Hard)
- Reset options when you've completed all questions

### 💾 Persistent Storage
- All data persists between sessions using `localStorage`
- Tracks companies, interviews, and seen questions
- No account required — works entirely in your browser

---

## Tech Stack

| Tool | Version | Notes |
|---|---|---|
| React | 19 | Hooks-based, functional components only |
| Tailwind CSS | v3 | Utility-first styling |
| lucide-react | latest | Icon library |
| react-scripts | 5.0.1 | Create React App — not ejected |
| Node.js | 20 | Required (v14 is incompatible with @testing-library/dom v10) |

---

## Getting Started

### Prerequisites
- Node.js **20+** (install via [nvm](https://github.com/nvm-sh/nvm))
- npm (bundled with Node)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/aKroub/job-interview-assistant.git
cd job-interview-assistant

# 2. Use the correct Node version
nvm use 20

# 3. Install dependencies
cd interview-prep-tracker
npm install

# 4. Start the dev server
npm start
```

The app opens at `http://localhost:3000`.

---

## Development

```bash
cd interview-prep-tracker

# Start dev server with hot reload
nvm use 20 && npm start

# Production build (must be clean — 0 errors, 0 warnings)
nvm use 20 && npm run build

# Run all tests (must all pass before any commit)
nvm use 20 && npm test -- --watchAll=false --verbose
```

---

## Project Structure

```
interview-prep-tracker/src/
│
├── constants/                     # Static data — no logic, no React
│   ├── questions.js               # SYSTEM_DESIGN_QUESTIONS bank (Google / Microsoft / Facebook)
│   └── stages.js                  # STAGES array + STAGE_LABELS map
│
├── services/                      # I/O abstractions — injectable in tests
│   └── storageService.js          # localStorageService + createMemoryStorage()
│
├── utils/                         # Pure functions — no React, no globals
│   ├── companyUtils.js            # createCompany, applyStageUpdate, applyDelete, …
│   └── questionUtils.js           # getAvailableQuestions, addSeenQuestion, …
│
├── hooks/                         # React state + persistence
│   ├── useCompanies.js            # Companies + interviews state and mutations
│   ├── useSeenQuestions.js        # Seen questions Set + selectors
│   └── useInterviewTracker.js     # Thin composition of the two hooks above
│
├── components/
│   ├── shared/
│   │   ├── DifficultyBadge.jsx    # Reusable difficulty colour badge
│   │   └── TabNav.jsx             # Three-tab navigation bar
│   ├── AddCompanyModal/
│   │   └── AddCompanyModal.jsx
│   ├── KanbanBoard/
│   │   ├── KanbanBoard.jsx
│   │   ├── KanbanColumn.jsx
│   │   └── CompanyCard.jsx
│   ├── TimelineView/
│   │   ├── TimelineView.jsx
│   │   ├── InterviewRow.jsx
│   │   └── AddInterviewForm.jsx
│   └── PrepContentView/
│       ├── PrepContentView.jsx
│       ├── CompanyQuestionSection.jsx
│       └── QuestionCard.jsx
│
├── InterviewPrepTracker.jsx       # Thin orchestrating shell (~110 lines)
├── App.js                         # Renders <InterviewPrepTracker />
└── App.test.js                    # Integration smoke tests
```

### Architecture rules
- Each layer imports **only from layers below it** — components never import hooks or services
- All components are **fully presentational** — they receive data and callbacks via props and own no global state
- All **business logic lives in `utils/`** as pure functions (no React, no globals)
- All **state and persistence lives in `hooks/`**, which accept an injectable `storage` parameter

---

## Testing

The test suite is split into layers, matching the architecture:

| File | What it tests |
|---|---|
| `src/App.test.js` | Integration smoke test — app renders and default view loads |
| `src/utils/companyUtils.test.js` | Pure function unit tests (no React) |
| `src/utils/questionUtils.test.js` | Pure function unit tests (no React) |
| `src/hooks/useCompanies.test.js` | Hook tests with injected in-memory storage |
| `src/hooks/useSeenQuestions.test.js` | Hook tests with injected in-memory storage |

```bash
# Run all tests with verbose output
npm test -- --watchAll=false --verbose

# Expected output:
# Test Suites: 5 passed, 5 total
# Tests:       64 passed, 64 total
```

Tests never mock `localStorage` globally — they inject a `createMemoryStorage()` instance instead, keeping each test fully isolated.

---

## Usage Guide

### Adding Companies
1. Navigate to the **Pipeline** tab
2. Click **Add Company**
3. Enter company name, position, and initial stage
4. Click **Add Company** to save

### Managing the Pipeline
- Use the dropdown on each card to move a company to a different stage
- Click the **✕** icon to remove a company

### Scheduling Interviews
1. Go to the **Timeline** tab
2. Click **Add Interview** next to a company
3. Enter type (e.g. "Technical Round"), date, and time
4. Update status as the interview progresses (Scheduled → Completed / Cancelled)

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
export const STAGES = ['interested', 'applied', 'phone', 'technical', 'final', 'offer'];
export const STAGE_LABELS = { interested: 'Interested', /* ... */ };
```

---

## Future Enhancements

- [ ] Notes section per company
- [ ] Export data as JSON / CSV
- [ ] Email reminders for upcoming interviews
- [ ] More question categories (behavioural, coding, etc.)
- [ ] Dark mode
- [ ] Mobile responsive improvements
- [ ] Calendar app integration
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
