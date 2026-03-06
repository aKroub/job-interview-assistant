---
name: code-review
description: >
  Use when the user asks to review code, review a PR, check code quality, audit changes,
  or says "review", "code review", "PR review", "check my code", "look over this",
  "audit", "what do you think of this code", "review these changes", "is this ready to merge".
  Also use proactively after completing a multi-file implementation before committing.
context: fork
---

# Code Review

Structured, severity-driven code review optimized for Claude Code's terminal-first workflow.

**Announce at start:** "Starting Code Review. I will scope the diff, analyze by category, and deliver findings ranked by severity."
**State Tracking:** At the top of EVERY response during this workflow, print `[Review Phase: X]`.

---

## Phase 0: Scope the Review

Determine WHAT to review. Use the first match:

1. **User provides a PR number** → `gh pr diff <number>`
2. **User provides a branch** → `git diff main...<branch>`
3. **User provides specific files** → read those files
4. **Uncommitted changes exist** → `git diff` (staged + unstaged)
5. **Recent commits on current branch** → `git diff main...HEAD`
6. **User points to code inline** → review what they pasted/referenced

Collect:
- The **full diff** (every changed file, every hunk)
- The **list of changed files** with change type (added/modified/deleted)
- The **commit messages** on the branch (if applicable)
- The **CLAUDE.md** or project conventions (if present in the repo)

**Output:** State what you're reviewing, how many files, and the approximate scope.

---

## Phase 1: Understand Context

Before judging code, understand it:

1. **Read surrounding code** — don't review hunks in isolation; read the full files that changed
2. **Identify the intent** — what is this change trying to accomplish? Check commit messages, PR description, or ask the user
3. **Note the project conventions** — if CLAUDE.md or similar exists, the review must enforce those standards
4. **Check the architecture** — does the change respect the project's layered structure, module boundaries, and import rules?

**Skip this phase** only if the user explicitly asks for a quick/surface-level review.

---

## Phase 2: Analyze by Category

Review the diff through each lens below. Not every category applies to every change — skip categories that are irrelevant to the diff.

### 2.1 Correctness

The most important category. Does the code do what it's supposed to?

- Logic errors, off-by-one, wrong comparisons, inverted conditions
- Null/undefined handling — can any variable be unexpectedly null?
- Edge cases — empty arrays, zero values, empty strings, boundary values
- State mutations — is immutability preserved where required?
- Async correctness — missing `await`, unhandled rejections, race conditions
- Error paths — does every `try/catch` handle the right exceptions? Are errors swallowed silently?
- Functional updater form — state updates depending on previous state must use `prev =>`

### 2.2 Security

- **Injection** — SQL injection, command injection, XSS, template injection
- **Authentication/Authorization** — missing auth checks, privilege escalation, broken access control
- **Secrets** — hardcoded API keys, tokens, passwords, credentials in code or config
- **Input validation** — untrusted input used without sanitization at system boundaries
- **Sensitive data exposure** — PII in logs, error messages leaking internals, overly verbose responses
- **Dependency risk** — new dependencies with known CVEs, unmaintained packages, excessive permissions

### 2.3 Performance

- **N+1 queries / loops** — database calls or API calls inside loops
- **Blocking operations** — synchronous I/O on hot paths, blocking the event loop
- **Unnecessary work** — redundant computations, re-renders, duplicate fetches
- **Missing concurrency** — sequential `await` calls that could be `Promise.all`
- **Unbounded growth** — collections that grow without limit, missing pagination
- **Algorithmic complexity** — O(n^2) or worse when O(n) or O(1) alternatives exist (e.g., `.find()` in a loop vs. `Map`/`Set`)

### 2.4 Maintainability

- **Naming** — do names accurately describe what the code does? Would another developer understand them?
- **Complexity** — deeply nested logic, long functions, functions doing more than one thing
- **Duplication** — repeated logic that should be extracted (but don't flag <3 occurrences as premature abstraction)
- **Dead code** — unreachable branches, unused variables, commented-out code
- **Magic values** — hardcoded numbers/strings that should be named constants
- **Coupling** — tight coupling between modules that should be independent; import rule violations

### 2.5 Testing

- **Coverage** — are the new/changed code paths tested? Are edge cases covered?
- **Test quality** — do tests assert behavior or implementation details? Are mocks appropriate?
- **Regression risk** — does this change break existing tests? Are there missing regression tests for fixed bugs?
- **Test isolation** — do tests depend on global state, execution order, or real I/O?
- **Immutability assertions** — for functions that transform state, is non-mutation of input tested?

### 2.6 Simplicity

Complexity is a cost — every abstraction, indirection, and special case makes the system harder to understand, harder to extend, and more error-prone. This is not about avoiding hard problems; it's about solving them with the least machinery possible.

- **Over-abstraction** — helpers, wrappers, or base classes introduced for a single use case. Three similar lines of code are better than a premature abstraction. Would a new contributor understand why this layer exists?
- **Unnecessary indirection** — data or control flow that bounces through multiple files/functions when a direct path would be clearer. Every hop is a place where bugs can hide
- **Speculative generality** — code designed for hypothetical future requirements that don't exist today. Feature flags, config-driven behavior, or plugin architectures without a concrete second use case
- **Excessive branching** — proliferating `if/else` chains, strategy patterns, or polymorphism to handle edge cases that could be eliminated by simplifying the data model or API contract upstream
- **Accidental state** — extra state variables that track what could be derived, leading to synchronization bugs. Can this state be computed from what already exists?
- **Gold-plating** — adding error handling, validation, retry logic, or fallbacks for scenarios that cannot actually happen in the current system. Trust internal code; validate at boundaries
- **Scope creep in the diff** — the change does more than what was asked. Refactors bundled with features, "while I'm here" improvements, or unrelated cleanups mixed into the same change

**Calibration:** This category is about proportionality, not minimalism. A feature that genuinely needs a new abstraction layer should have one. The question is always: "Does the complexity of the solution match the complexity of the problem?" If the answer is no — if the scaffolding outweighs the payload — flag it.

### 2.7 API & Contract

Only applies when interfaces, public APIs, or data contracts change:

- **Breaking changes** — removed fields, changed types, renamed endpoints
- **Backwards compatibility** — do existing callers still work?
- **Error contracts** — are error responses documented and consistent?
- **Validation boundaries** — is input validated at the system boundary, not deep inside?

---

## Phase 3: Classify Findings

Every finding gets a severity. This is the most important part — it determines what the developer acts on first.

```
CRITICAL  — Must fix before merge. Security vulnerability, data loss, crash,
            or correctness bug that affects users. Blocks the review.

HIGH      — Should fix before merge. Logic error, missing error handling,
            architectural violation, or significant performance issue.
            Strongly recommended but reviewer discretion applies.

MEDIUM    — Recommended improvement. Code smell, maintainability concern,
            missing test coverage, or moderate performance issue.
            Good to fix now but won't break anything if deferred.

LOW       — Minor suggestion. Style preference, naming nitpick, optional
            optimization, or "nice to have" improvement.
            Defer if time-constrained.
```

**Severity calibration:**
- Don't inflate — most code smells are MEDIUM, not HIGH
- Don't deflate — a real security flaw is always CRITICAL, even if it's one line
- When unsure between two levels, pick the lower one — false alarms erode trust

---

## Phase 4: Deliver the Review

Present findings in this exact structure:

### Header

```
## Code Review: <brief description of what was reviewed>
**Scope:** <N files changed, M insertions, K deletions>
**Branch:** <branch name or PR number>
```

### Findings (grouped by severity, highest first)

For each finding:

```
### [SEVERITY] <Short title>
**File:** `path/to/file.ext:line_number`
**Category:** Correctness | Security | Performance | Maintainability | Testing | API

<1-3 sentence description of the issue and WHY it matters>

**Current code:**
<relevant snippet>

**Suggested fix:**
<concrete fix or direction — not vague advice>
```

**Rules for findings:**
- Include the actual code snippet — never say "the code on line X" without showing it
- Suggest a concrete fix, not just "consider improving this"
- Explain WHY it's a problem, not just WHAT is wrong
- Group related findings (e.g., the same pattern repeated in 3 files = 1 finding, not 3)
- Max 15 findings total — if you have more, keep only the highest severity ones and note "N additional low-severity items omitted"

### What Looks Good

Briefly note (2-4 bullet points) what the code does well. This is not filler — it confirms that good patterns were noticed and should be continued. Skip only if the review is entirely negative.

### Verdict

End with exactly one of:

```
**Verdict: READY TO MERGE** — No critical or high issues. Ship it.

**Verdict: NEEDS ATTENTION** — No critical issues, but high-severity items
should be addressed. Merge after fixes.

**Verdict: NEEDS WORK** — Critical issues found. Do not merge until resolved.
```

---

## Adapting to Project Conventions

If CLAUDE.md or equivalent project instructions exist, treat them as additional review criteria:

- **Import rules** (e.g., "components never import hooks") → flag violations as HIGH
- **Testing patterns** (e.g., "never mock localStorage directly") → flag violations as HIGH
- **Architecture layers** (e.g., "utils never import React") → flag violations as HIGH
- **Style rules** (e.g., "named exports only") → flag violations as MEDIUM
- **Git workflow** (e.g., "no direct commits to main") → flag violations as CRITICAL

Project conventions override generic best practices when they conflict.

---

## Quick Review Mode

If the user asks for a "quick review", "quick look", or "glance":

1. Skip Phase 1 (deep context)
2. Focus only on Correctness and Security in Phase 2
3. Only report CRITICAL and HIGH findings in Phase 4
4. Omit "What Looks Good" section
5. Still deliver a verdict

---

## Self-Review Mode

When reviewing your own generated code (e.g., after implementing a feature):

1. Be extra skeptical — you're biased toward thinking your own code is correct
2. Re-read the original requirements and verify each one is met
3. Check for the specific anti-patterns you tend to produce:
   - Over-engineering (added more than what was asked)
   - Missing edge cases in the happy path you optimized for
   - Inconsistency with existing patterns in the codebase
4. Run the test suite and include results in the review

---

## Common Mistakes

| Mistake | Why it's wrong | What to do instead |
|---|---|---|
| Reviewing only the diff hunks | Missing context leads to false positives | Read surrounding code and full files |
| Flagging style in unfamiliar codebases | Your style preference =/= their convention | Check project conventions first |
| "Consider using X" without explaining why | Vague advice is ignored | Explain the concrete benefit or risk |
| Treating all findings as equal severity | Developers ignore the review entirely | Classify strictly, lead with critical |
| Suggesting rewrites for working code | "Better" is the enemy of "shipped" | Only suggest rewrites for real problems |
| Reviewing generated/config files | Lock files, build output, auto-generated code | Skip unless security-relevant |
| Nitpicking when critical issues exist | Priorities are wrong | Lead with what matters most |
| Not reading tests | Missing test gaps | Always check test coverage for changes |

---

## Red Flags — STOP and Escalate

These patterns warrant calling out prominently, even interrupting the normal flow:

- **Secrets in code** — API keys, passwords, tokens committed to the repo
- **Disabled security** — auth checks commented out, CORS set to `*`, verification skipped
- **Data destruction** — `DROP TABLE`, `rm -rf`, `git push --force` without safeguards
- **Silent error swallowing** — empty `catch {}` blocks that hide failures
- **Eval / dynamic code execution** — `eval()`, `Function()`, `exec()` with user input
- **Dependency on specific execution order** — tests or code that only works by accident

---

## Quick Reference

```
ENTER CODE REVIEW:
  0. Scope (what am I reviewing?)
  1. Context (what is this change trying to do?)
  2. Analyze (7 categories: correctness, security, performance,
     maintainability, testing, simplicity, API)
  3. Classify (CRITICAL > HIGH > MEDIUM > LOW)
  4. Deliver (structured findings + verdict)

SEVERITY GUIDE:
  CRITICAL  — blocks merge, security/correctness/data issue
  HIGH      — should fix, logic/architecture/perf issue
  MEDIUM    — recommended, code smell/maintainability
  LOW       — minor, style/nitpick/optional

VERDICTS:
  READY TO MERGE  — no critical/high issues
  NEEDS ATTENTION — has high issues, fixable
  NEEDS WORK      — has critical issues, do not merge

OUTPUT RULES:
  - Show code snippets, not line references
  - Suggest concrete fixes, not vague advice
  - Explain why, not just what
  - Max 15 findings, highest severity first
  - Group related issues into one finding
```
