---
name: debug-mode
description: Use when encountering any bug, test failure, or unexpected behavior - aggressive auto-reproduction with instrumented logging, hypothesis-driven debugging, and mandatory regression tests
---

# Debug Mode

Hypothesis-driven, instrumented debugging optimized for Claude Code's terminal-first workflow.

**Announce at start:** "Entering Debug Mode. I will hypothesize, instrument, reproduce, analyze, fix, and verify."
**State Tracking:** At the top of EVERY response during this workflow, print `[Current Phase: X]`.

## The Loop

```
Phase 0: SAFETY     → git stash + isolated branch
Phase 1: DISCOVER   → scan project tools, test infra, recent changes
Phase 2: HYPOTHESIZE → 3-5 ranked theories with required evidence
Phase 3: REPRODUCE  → write test/script AND COMMIT IT (isolate repro from debug logs)
Phase 4: INSTRUMENT → add [DEBUG-MODE] tagged logs (dirtying the working tree)
Phase 5: ANALYZE    → run reproduction, capture logs to file, correlate
Phase 6: RESET      → git restore . (perfectly removes all debug logs)
Phase 7: FIX        → implement fix at root cause
Phase 8: VERIFY     → mandatory red-to-green check
```

**Iron Laws:**
```
1. NO FIXES WITHOUT REPRODUCTION FIRST.
2. NO GUESSING — INSTRUMENT AND OBSERVE.
3. NEVER HANG THE TERMINAL — detach background processes safely.
4. PROTECT YOUR CONTEXT — never dump raw logs, always grep/tail to files.
5. RESET BEFORE FIXING — use git restore to remove debug logs, never manual edits.
```

---

## Phase 0: Safety Branch

**BEFORE touching any code:**

```bash
# Stash any uncommitted work
git stash push -m "pre-debug-mode-stash"

# Create isolated branch
git checkout -b debug-mode/$(date +%Y%m%d-%H%M%S)
```

If git is not available, proceed but note that manual cleanup will be required in Phase 6.

---

## Phase 1: Project Discovery

Scan the environment to know your tools:

1. **Runner:** `package.json` scripts, `Makefile`, `Taskfile`, or `docker-compose.yml`
2. **Tests:** Find test directories and frameworks (jest, vitest, pytest, go test, rspec, phpunit)
3. **History:** `git log --oneline -10 -- <suspect-path>` to see recent changes
4. **Infra:** Docker/docker-compose available? CI config?

**Output:** Mental model of what you can run and what changed recently.

---

## Phase 2: Hypothesize

Generate **3-5 ranked hypotheses**.

```
H<N>: <short-name>
  Theory: <what is wrong>
  Evidence needed: <what would prove this>
  Likely files: <where to look>
```

Investigate most likely first.

---

## Phase 3: Reproduce and Isolate (CRITICAL)

A bug you cannot reproduce is a bug you cannot fix.

### Reproduction Strategies (Priority Order)

#### Strategy 1: Standalone Repro Script (Fastest)

Write `repro.js`, `repro.py`, or `repro.sh` that imports the code and triggers the bug directly. Bypasses complex test framework config issues.

```javascript
// repro.js — standalone, no test framework needed
const { getUserProfile } = require('./src/api/user');
(async () => {
  const profile = await getUserProfile('user-123');
  console.log('passwordChangedAt:', profile.passwordChangedAt);
  // Expected: non-null. Actual: null — BUG CONFIRMED
  process.exit(profile.passwordChangedAt ? 0 : 1);
})();
```

#### Strategy 2: Failing Unit Test (Gold Standard)

Write a test in the native framework when the framework is easy to use:

```typescript
test('should return fresh profile data after password change', async () => {
  const user = await createTestUser();
  await changePassword(user.id, 'new-password');
  const profile = await getUserProfile(user.id);
  expect(profile.passwordChangedAt).not.toBeNull();
});
```

#### Strategy 3: curl / HTTP for API Bugs

```bash
curl -v -X POST localhost:3000/api/endpoint \
  -H 'Content-Type: application/json' \
  -d '{"trigger": "bug"}'
```

#### Strategy 4: Loop for Flaky/Intermittent Bugs

```bash
for i in $(seq 1 50); do
  echo "Run $i..."
  node repro.js && echo "PASS" || echo "FAIL <<<"
done
```

#### Strategy 5: Manual (LAST RESORT)

Only if strategies 1-4 are impossible. Ask user for exact reproduction steps.

### Bash Safety: Background Processes

If starting a server for reproduction, **YOU MUST DETACH IT** or you will hang the terminal:

```bash
# CORRECT: detach the server
nohup npm run dev > server.log 2>&1 &
SERVER_PID=$!
sleep 3

# ... run reproduction ...
curl -s localhost:3000/api/trigger-bug

# ALWAYS clean up
kill $SERVER_PID 2>/dev/null
```

**NEVER** run `npm run dev` or any long-running process without `nohup ... &`.

### The Commit Hack (KEY INSIGHT)

Once you have a failing reproduction (script or test), **commit it immediately**:

```bash
git add repro.js  # or the test file
git commit -m "chore: add failing reproduction for debug-mode"
```

**Why this matters:** In Phase 6, we use `git restore .` to instantly remove all debug instrumentation. Your repro test/script survives because it's committed. Manual log deletion causes syntax errors, broken indentation, and hanging brackets. `git restore .` is perfect every time.

### Bug-Type Lookup

| Bug Type | Best Strategy |
|----------|--------------|
| Logic error | 1 (standalone) or 2 (test) |
| API response wrong | 3 (curl) |
| Race condition | 4 (loop 50x) |
| State corruption | 1 (repro script) |
| Auth/session | 1 (repro script) |
| Caching | 2 (test) |
| Flaky test | 4 (loop 50x) |
| CORS/headers | 3 (curl -v) |

**CRITICAL:** Do NOT proceed to instrumentation until you can reproduce the bug.

---

## Phase 4: Instrument

Add **hypothesis-tagged** debug logs to suspect code paths.

### Log Format

```
[DEBUG-MODE][H<N>-<hypothesis-name>][<function-name>] <message>
```

- `[DEBUG-MODE]` prefix makes grep-based cleanup bulletproof
- `[H<N>]` tag lets you filter by hypothesis during analysis
- For concurrency bugs, include a request/correlation ID: `[DEBUG-MODE][H1] reqId=${req.id} ...`

### Language Patterns

**JavaScript/TypeScript (stderr):**
```typescript
console.error('[DEBUG-MODE][H1-stale-cache][getUserProfile] cache key:', cacheKey, 'hit:', !!cached);
console.error('[DEBUG-MODE][H1-stale-cache][getUserProfile] state:', JSON.stringify({ cacheKey, cacheHit: !!cached }));
```

**Python (stderr):**
```python
import sys
print(f'[DEBUG-MODE][H1-stale-cache][get_user_profile] cache_key={cache_key} hit={cached is not None}', file=sys.stderr)
```

**Go (stderr):**
```go
fmt.Fprintf(os.Stderr, "[DEBUG-MODE][H1-stale-cache][GetUserProfile] cacheKey=%s hit=%v\n", cacheKey, cached != nil)
```

**Ruby (stderr):**
```ruby
$stderr.puts "[DEBUG-MODE][H1-stale-cache][get_user_profile] cache_key=#{cache_key} hit=#{!cached.nil?}"
```

**PHP (stderr):**
```php
error_log("[DEBUG-MODE][H1-stale-cache][getUserProfile] cache_key={$cacheKey} hit=" . ($cached ? 'true' : 'false'));
```

### What to Log

For each hypothesis, instrument the **decision points**:
- Function entry (arguments received)
- Branch taken (which if/else path)
- External call (what was sent, what came back)
- State mutation (before and after)
- Function exit (return value)

---

## Phase 5: Analyze (Protect Context)

Run the reproduction with instrumentation in place.

### Context Window Protection

**DO NOT dump raw logs to stdout.** Route to a file and query it:

```bash
# Run and capture ALL output to file
node repro.js > debug.log 2>&1

# Query intelligently (protects your context window)
grep '\[DEBUG-MODE\]' debug.log

# If logs are large, be surgical:
grep -C 2 'Exception' debug.log | head -n 50
grep '\[DEBUG-MODE\]\[H1' debug.log | tail -n 20
```

**NEVER** let a command dump unbounded output. Always pipe through `grep`, `head`, or `tail`.

### Filter by Hypothesis

```bash
grep '\[DEBUG-MODE\]\[H1' debug.log   # Only H1 logs
grep '\[DEBUG-MODE\]\[H2' debug.log   # Only H2 logs
```

### Analysis Verdict

For each hypothesis:
```
H<N> ANALYSIS:
  Expected: <what logs should show if hypothesis is correct>
  Actual:   <what logs actually show>
  Verdict:  CONFIRMED / REFUTED / INCONCLUSIVE
  Evidence: <paste relevant log lines>
```

### Heisenbug Check

If adding logs **fixed** the bug, you have a race condition or timing issue. Instrument timing and locks instead of state.

### If INCONCLUSIVE

Add more instrumentation. Narrow the search space. Go back to Phase 4.

**Max 3 instrumentation iterations.** If still inconclusive after 3 rounds:
1. Re-evaluate hypotheses
2. Generate new hypotheses based on what you've learned
3. Consider asking user for more context

---

## Phase 6: Reset (Clean Slate)

Once a hypothesis is CONFIRMED, **do not manually delete debug logs**. Manual deletion causes syntax errors, broken indentation, and hanging brackets.

```bash
# Instantly removes ALL [DEBUG-MODE] logs.
# Your repro test/script survives because you committed it in Phase 3.
git restore .
```

If not using git, carefully remove `[DEBUG-MODE]` lines and verify syntax:
```bash
grep -rn '\[DEBUG-MODE\]' . --include='*.ts' --include='*.js' --include='*.py' --include='*.go' --include='*.rb' --include='*.php'
# Remove each line, then verify the file still parses
```

---

## Phase 7: Fix

**Only after hypothesis is CONFIRMED and workspace is CLEAN (Phase 6).**

1. Fix at ROOT CAUSE, not symptom
2. Minimal change — don't refactor during a bugfix
3. Fix ONLY what the log evidence pointed to

---

## Phase 8: Verify (Red to Green)

Prove the fix works using the reproduction from Phase 3.

```bash
# 1. Run the test/script — MUST PASS (GREEN)
node repro.js  # or: npm test -- --testPathPattern="repro"

# 2. Temporarily stash the fix
git stash push -m "temp-verify-fix"

# 3. Run the test/script — MUST FAIL (RED)
node repro.js
# Expected: non-zero exit / test failure

# 4. Restore the fix
git stash pop
```

**If the test passes without the fix, it's a bad test.** Rewrite it.

### Finalize

1. Integrate standalone repro scripts into the actual test suite as permanent regression tests
2. Delete temporary files (`repro.js`, `debug.log`, `server.log`)
3. Run full test suite — no regressions
4. Present structured commit message:

```
fix: <short description>

Root cause: <one sentence explaining the actual root cause>
Evidence: <what logs/tests revealed>
Regression test: <test file and test name>

Closes #<issue-number>
```

---

## Quick Reference

```
ENTER DEBUG MODE:
  0. git stash + branch
  1. Discover project tools
  2. Hypothesize (3-5 ranked theories)
  3. Reproduce AND COMMIT the repro (key!)
  4. Instrument ([DEBUG-MODE][H<N>-name][func] message)
  5. Analyze (logs to file, grep, protect context)
  6. Reset (git restore . — clean slate)
  7. Fix (root cause only, minimal change)
  8. Verify (green, stash, red, pop)

LOG FORMAT:
  [DEBUG-MODE][H1-hypothesis-name][functionName] key=value

REPRODUCTION PRIORITY:
  1. Standalone script  2. Failing test  3. curl  4. Loop 50x  5. Manual

BASH SAFETY:
  nohup npm run dev > server.log 2>&1 &
  NEVER run long processes without detaching.

CONTEXT SAFETY:
  Always: command > file.log 2>&1 then grep
  Never: let raw output flood stdout
```

---

## Red Flags — STOP

- "Let me just try a quick fix..." → STOP. Did you reproduce?
- "Obviously it's..." → STOP. Where's the evidence?
- "I don't need to instrument..." → STOP. Instrument anyway.
- "The test passes so we're done..." → STOP. Did you verify red-to-green?
- "I'll clean up the logs manually..." → STOP. Use `git restore .`
- Starting `npm run dev` without `nohup ... &` → STOP. You'll hang.
- Dumping raw logs to stdout → STOP. Route to file, then grep.
