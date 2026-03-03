---
name: write-docs
description: >
  Write, update, or audit project documentation files — README, CLAUDE.md, SETUP.md, SKILL.md,
  CONTRIBUTING.md, CHANGELOG.md, and any similar developer-facing documentation.
  Use when the user asks to "update the README", "write CLAUDE.md", "create documentation",
  "document this feature", "update the setup guide", "write a changelog", "write contributing
  guidelines", "audit the docs", "improve documentation", "the docs are outdated", or when
  documentation is missing, stale, or incomplete. Also invoke proactively when a large feature
  is completed that materially changes project setup, architecture, or workflow.
argument-hint: "[readme|claude.md|setup.md|skill|contributing|changelog|<filename>] [create|update|audit]"
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(git log*, git diff*, git status*, git tag*, git blame*, npm run*, cat*)
---

# Write Docs

Structured, accuracy-first documentation authoring optimized for developer-facing files.

**Announce at start:** "Entering Write Docs. I will identify the target, gather project intelligence, and produce accurate documentation grounded in the actual codebase."
**State Tracking:** At the top of EVERY response during this workflow, print `[Write Docs — Phase X: <phase-name>]`.

**Iron Laws:**
```
1. NEVER INVENT — every command, path, version, and claim must be verified against actual project files.
2. NEVER COPY-PASTE — don't import docs from other projects; every doc reflects THIS codebase.
3. ACCURACY OVER COMPLETENESS — a shorter accurate doc beats a longer one with wrong commands.
4. VERIFY BEFORE WRITING — read the code first, write second.
5. AUDIT MODE IS READ-ONLY — when auditing, produce findings only; do not edit files.
```

---

## Phase 0: Identify Target and Operation

Parse `$ARGUMENTS` (format: `[doc-type] [operation]`). If arguments are empty or ambiguous, infer from context:

### Doc Type Router

| Argument / Context Signal | Target | Jump to |
|---|---|---|
| `readme` / "update README" / "create README" | `README.md` | Section A |
| `claude.md` / "update CLAUDE.md" / "AI instructions" | `CLAUDE.md` | Section B |
| `setup.md` / "setup guide" / "installation guide" | `SETUP.md` | Section C |
| `skill` / "new skill" / "write SKILL.md" | `.claude/skills/<name>/SKILL.md` | Section D |
| `contributing` / "contributing guidelines" | `CONTRIBUTING.md` | Section E |
| `changelog` / "update changelog" / "add release notes" | `CHANGELOG.md` | Section F |
| `<filename>` / "document X" | That specific file | Section G |
| (no argument, unclear) | → Ask the user | — |

### Operation Router

| Argument | Operation | Behavior |
|---|---|---|
| `create` | Create new | Scaffold from template + project intelligence |
| `update` | Update existing | Read existing → identify gaps → apply targeted edits |
| `audit` | Audit only | Produce findings report; no file edits (read-only) |
| (none / unclear) | Auto-detect | If file exists → `update`; if not → `create` |

**Output Phase 0 result:**
```
Target: <file path>
Operation: create | update | audit
Reason: <why this was chosen>
```

---

## Phase 1: Gather Project Intelligence

**This phase is mandatory — never skip it.** Documentation grounded in actual code is trustworthy; documentation written from assumptions is a liability.

### 1.1 Locate Key Files

```
Read or confirm existence of:
- package.json / go.mod / requirements.txt / Cargo.toml → tech stack, deps, scripts
- src/ or lib/ entry points → understand primary abstractions
- Existing docs (README, CLAUDE.md, SETUP.md, etc.) → understand current state
- .env.example → understand required configuration
- docker-compose.yml / Dockerfile → understand containerization
- .github/workflows/ → understand CI/CD
- Any CLAUDE.md → project conventions (treat as ground truth)
```

### 1.2 Understand the Project

Answer these questions from the code, not from assumptions:

1. **What is this project?** Read the root `package.json` description, main entry point, or README title.
2. **What are the key directories?** Glob `src/**`, `lib/**`, `server/**`, etc.
3. **What commands exist?** Read `package.json` `scripts`, `Makefile` targets, etc.
4. **What are the prerequisites?** Read `.nvmrc`, `.tool-versions`, `package.json` `engines`, `requirements.txt`.
5. **What environment variables are needed?** Read `.env.example`, config files.
6. **What tests exist?** Find test directories and runner config.
7. **What changed recently?** `git log --oneline -20` for CHANGELOG context.

### 1.3 Audit Existing Documentation (if `update` or `audit`)

For each section of the existing doc, mark:
- **Accurate** — verified correct against current code
- **Outdated** — was correct but code has since changed
- **Missing** — covers something that should be here but isn't
- **Invented** — claims something that can't be verified in the codebase

Only proceed to Phase 2 once you have a clear picture of what needs to change and why.

---

## Phase 2: Write / Update / Audit

Use the section for the detected doc type. Each section has a template and quality rules.

---

### Section A: README.md

The README is the front door of the project. Its job is to answer one question in 30 seconds: *"What is this, and how do I run it?"*

#### Structure

```markdown
# <Project Name>

<One-sentence description of what the project does and who it's for.>

## Features

- <Concrete feature 1>
- <Concrete feature 2>
- <Concrete feature 3>

## Prerequisites

- <Runtime> <exact version> (e.g. `Node.js 20+`)
- <Tool> (e.g. `nvm` for Node version management)

## Setup

<Step-by-step minimal setup. Every command must be verified to work.>

```bash
git clone <repo-url>
cd <project-dir>
<install command>
<configure command>
<start command>
```

## Usage

<How to use the running app or CLI. Include at least one concrete example.>

## Architecture

<Optional — only include if helpful to contributors. Link to SETUP.md or CLAUDE.md for depth.>

## Contributing

<Short paragraph. Link to CONTRIBUTING.md if it exists.>

## License

<License name and year.>
```

#### README Quality Rules

- **No invented commands** — test every `bash` block mentally against package.json scripts
- **No version numbers from memory** — read them from package.json / .nvmrc / .tool-versions
- **No placeholder text** — every `<X>` must be filled before the doc is done
- **Single setup path** — pick one canonical setup flow; don't give three alternatives for every step
- **Tone:** neutral and concrete — no hype, no marketing copy, no "blazing fast"
- **Length:** short is better — if it needs 500+ lines, split into SETUP.md and CLAUDE.md
- **Badges:** only include them if the CI/CD pipeline is actually configured and working

---

### Section B: CLAUDE.md

CLAUDE.md is the AI assistant's orientation guide. It tells Claude Code (and any AI tool reading the repo) the rules, architecture, and context it needs to work correctly without introducing bugs or violating conventions.

**Key principle:** CLAUDE.md is a contract, not documentation. Every rule must be enforceable (Claude can follow it) and every architectural claim must be verifiable (it's true of the actual code).

#### Structure

```markdown
# CLAUDE.md — <Project Name>

## Project Overview

<What the project is, in 2-3 sentences. Include tech stack, key entry points, ports.>

## Tech Stack

| Tool | Version | Notes |
|---|---|---|
| <runtime> | <version> | <why or notable config> |
| ... | | |

## Git Workflow

<Branch naming, PR process, merge rules. Be specific — "feature/<name>" not "some branch name".>

## Quality Gates

<Exact commands for lint, build, test. Must match package.json scripts.>

## Architecture

<Layered directory overview. Include the dependency direction rule: which layers can import from which.>

### Where Does New Code Go?

<Decision tree or table for placing new files.>

## What NOT To Do

<Explicit list of the most common mistakes for this codebase. Be concrete, not generic.>

## Testing Conventions

<How to test each layer. Include injection patterns and what NOT to mock.>

## Common Commands

<Reference table of daily-use commands.>

## Troubleshooting

<Table: Symptom → Likely cause → Fix.>
```

#### CLAUDE.md Quality Rules

- **Every rule must be actionable** — "write clean code" is useless; "never define a component inside another component's render function" is actionable
- **Architecture must match reality** — read the actual directory structure before describing it
- **Commands must be copy-paste ready** — include `cd` prefixes, `nvm use`, flags
- **"What NOT To Do" is the most important section** — derive it from actual mistakes or anti-patterns in the codebase
- **No generic advice** — everything in CLAUDE.md should be specific to THIS project; if it could appear unchanged in any project, cut it
- **No outdated sections** — if a section describes a pattern that was refactored away, remove it

---

### Section C: SETUP.md

SETUP.md is the detailed setup guide for developers and contributors. Its job is to get someone from zero to a running local environment with zero ambiguity.

#### Structure

```markdown
# Setup Guide

## Prerequisites

Before you begin, ensure you have:

| Tool | Version | How to install |
|---|---|---|
| <tool> | <exact version> | <link or command> |

## 1. Clone the Repository

```bash
git clone <repo-url>
cd <project-dir>
```

## 2. Install Dependencies

```bash
<install commands>
```

## 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:

| Variable | Description | Where to get it |
|---|---|---|
| `VAR_NAME` | What it controls | Where to obtain the value |

## 4. First Run

```bash
<start command>
```

Expected output:
```
<what success looks like>
```

Open <URL> in your browser.

## 5. Run Tests

```bash
<test commands>
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| <error> | <cause> | <fix> |
```

#### SETUP.md Quality Rules

- **Ordered steps** — numbered sections, no optional first steps
- **Expected output** — every major command should say what success looks like
- **Every environment variable documented** — read `.env.example` and document every key
- **Troubleshooting is mandatory** — derive from actual error messages in the codebase or issues encountered during development
- **Platform notes** — if setup differs on macOS vs Linux vs Windows, note it explicitly
- **Version pinning** — always specify exact versions, never "latest"

---

### Section D: SKILL.md (Claude Code Skills)

Writing a new Claude Code skill definition.

**Before writing:** Confirm the skill name (`$ARGUMENTS`) and what it should do. Read existing skills in `.claude/skills/` to match the project's style.

#### Structure

```yaml
---
name: <skill-name>              # lowercase, hyphens only
description: >
  <What this skill does. Include trigger phrases users will say.
  Be specific — Claude uses this to decide when to auto-invoke.
  Format: "Use when [context]. Also use when [trigger phrases].">
argument-hint: "[<arg1>|<arg2>] [<option>]"   # shown in autocomplete
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(<safe-command-patterns>)
---
```

Followed by skill body with:
1. **Announce + State Tracking** — announcement line + phase header format
2. **Phases** — numbered, each with clear entry/exit criteria
3. **Quick Reference** — compact cheat sheet at the bottom
4. **Rules / Red Flags** — what the skill must never do

#### SKILL.md Quality Rules

- **Description must include trigger phrases** — copy exact user language (e.g. `"update readme"`, `"audit docs"`)
- **`allowed-tools` must be restrictive** — only list tools the skill genuinely needs; Bash patterns should be scoped (e.g. `Bash(npm run*)` not `Bash(*)`)
- **Every phase must have an exit condition** — "done when output is X" not "do stuff until finished"
- **Quick Reference is mandatory** — it's what Claude reads first next time the skill is invoked
- **`disable-model-invocation: true`** for destructive or irreversible skills (deploy, database ops, git push)

---

### Section E: CONTRIBUTING.md

CONTRIBUTING.md guides external contributors and new team members through the development workflow.

#### Structure

```markdown
# Contributing

Thank you for contributing to <Project Name>!

## Development Setup

See [SETUP.md](SETUP.md) for detailed setup instructions.

## Workflow

1. Fork the repo and create a branch: `git checkout -b feature/<your-feature>`
2. Make your changes, following the conventions in [CLAUDE.md](CLAUDE.md)
3. Run the quality gates (see below) — all must pass
4. Open a pull request against `main`

## Quality Gates

<Copy exact commands from package.json scripts — must pass before PR.>

## Code Conventions

<Key rules from CLAUDE.md, summarized for contributors.>

## Commit Messages

<Format: "type: short description" — feat, fix, chore, refactor, docs, test.>

## PR Guidelines

- Keep PRs small and focused — one thing per PR
- Include tests for any new behavior
- Update docs if behavior changes
```

---

### Section F: CHANGELOG.md

Follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

```markdown
# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- <New feature>

### Changed
- <Behavior change>

### Fixed
- <Bug fix>

### Removed
- <Removed feature>

## [<version>] — <date>

<same structure as Unreleased>
```

#### Populating from Git

Use git history to auto-populate entries:

```bash
# Get commits since last tag
git log --oneline <last-tag>..HEAD

# Get last tag
git describe --tags --abbrev=0 2>/dev/null || echo "no tags"
```

Map commit types to changelog sections:
- `feat:` → Added
- `fix:` → Fixed
- `refactor:` / `chore:` → Changed
- `BREAKING CHANGE:` / `!:` → [Removed] or [Changed] with callout

#### CHANGELOG Quality Rules

- **Never backfill invented history** — only log changes from actual git history
- **Dates are mandatory** for released versions — use `git tag -l --format='%(creatordate:short) %(refname:short)'`
- **[Unreleased] section always at top** — new items always go here first
- **Breaking changes get special callout** — `> ⚠️ BREAKING CHANGE: ...`

---

### Section G: Custom / Generic Documentation File

For any other documentation file (ADR, API reference, design doc, etc.):

1. **Read the existing file** (if any) to understand structure and scope
2. **Identify the reader** — who is this for? (developer, user, operator, future-self)
3. **Identify the one question it answers** — every doc answers a primary question
4. **Infer a structure** from the file name, content, or user instructions
5. **Apply general quality rules** (see Phase 3)

---

## Phase 3: Validate

**Run these checks before declaring the doc done**, regardless of doc type.

### Accuracy Checklist

- [ ] Every command verified against `package.json` scripts (or equivalent)
- [ ] Every file path verified by Glob or Read
- [ ] Every version number verified against actual config files (`.nvmrc`, `package.json`, etc.)
- [ ] Every environment variable verified against `.env.example`
- [ ] Every architectural claim verified against actual directory structure
- [ ] No placeholder text remaining (`<X>`, `TODO`, `your-x-here`)

### Completeness Checklist

- [ ] The primary question this doc answers is answered
- [ ] Happy path fully documented
- [ ] At least one troubleshooting entry (if setup/CLI doc)
- [ ] No sections that say only "see X" without explaining enough to act

### Quality Checklist

- [ ] No invented content — every claim traceable to a source file
- [ ] No generic advice that belongs in a style guide, not this doc
- [ ] Tone is neutral and concrete (not marketing copy)
- [ ] Code blocks have language tags for syntax highlighting
- [ ] Headers are in sentence case (not Title Case Throughout)
- [ ] No walls of text — use tables and lists for reference material

### Audit Mode Output (read-only, no edits)

When the operation is `audit`, produce a structured findings report:

```
## Doc Audit: <filename>

### Accuracy Findings

| Section | Status | Issue |
|---|---|---|
| Installation | OUTDATED | `npm install` should be `npm ci`; package.json confirms this |
| Architecture | ACCURATE | Matches actual directory structure |
| Env vars | MISSING | `DATABASE_URL` is in .env.example but not documented |

### Completeness Findings

- Missing: Troubleshooting section (common errors observed in codebase history)
- Missing: macOS vs Linux setup differences

### Recommendations

1. **HIGH** — Fix 3 outdated commands in Setup section (users will fail on install)
2. **MEDIUM** — Add missing env vars to the environment table
3. **LOW** — Add troubleshooting section

### Verdict: NEEDS UPDATE | UP TO DATE | OUTDATED
```

---

## Quick Reference

```
ENTER WRITE DOCS:
  0. Identify target file + operation (create|update|audit)
  1. Gather intelligence (read package.json, structure, existing docs, git log)
  2. Write using the section template for that doc type
  3. Validate accuracy, completeness, and quality

DOC TYPE ROUTER:
  readme        → README.md       (front door, what + how to run)
  claude.md     → CLAUDE.md       (AI contract: rules + architecture)
  setup.md      → SETUP.md        (zero to running, no ambiguity)
  skill         → SKILL.md        (Claude Code skill definition)
  contributing  → CONTRIBUTING.md (contributor workflow)
  changelog     → CHANGELOG.md    (keep-a-changelog format, from git)
  <file>        → That file        (infer structure from name/purpose)

IRON LAWS:
  - Never invent commands, paths, or versions — verify everything
  - Read before writing — intelligence gathering is not optional
  - Audit mode = read-only — findings report only, no file edits
  - Accuracy > completeness — shorter and correct beats longer and wrong

ACCURACY CHECKS:
  Commands  → verified in package.json scripts
  Paths     → verified by Glob/Read
  Versions  → verified in .nvmrc / package.json / .tool-versions
  Env vars  → verified in .env.example
  Structure → verified by actual directory listing
```

---

## Common Mistakes

| Mistake | Why it's wrong | What to do instead |
|---|---|---|
| Writing README before reading the code | Produces generic boilerplate or wrong commands | Do Phase 1 first — read package.json, entry points, structure |
| Copying commands from memory | Commands drift as the project evolves | Always read the current `scripts` in package.json |
| Documenting the ideal architecture, not the real one | Misleads contributors, erodes trust | Glob and Read the actual directories |
| Adding every env var to SETUP.md | .env.example is the source of truth | Read .env.example; document all keys found there |
| Keeping outdated troubleshooting entries | Users follow dead-end advice | Verify each fix is still valid against current code |
| CLAUDE.md with generic software advice | Wastes AI context window on noise | Every rule must be specific to THIS project |
| Writing SKILL.md without trigger phrases | Claude never auto-invokes the skill | `description` must include verbatim user phrases |
| Starting CHANGELOG from scratch | Loses real history | Use `git log` to source every entry |
