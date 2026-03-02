---
name: git-ops
description: >
  Use when the user asks to merge branches, rebase, resolve conflicts, sync with main, update
  stacked/cascading branches, manage feature branch chains, cherry-pick, or any non-trivial git
  operation. Also use when the user says "merge", "rebase", "sync", "update branch", "resolve
  conflicts", "cascade", "stack", "cherry-pick", "bring up to date", "catch up with main",
  "rebase chain", or "fix my branches".
disable-model-invocation: true
---

# Git Ops

Structured, safe version control management for any repository.
Handles merging, rebasing, conflict resolution, stacked branch chains, and branch hygiene.

**Announce at start:** "Entering Git Ops. I will assess the repo state, plan the operation, and execute with safety checks."
**State Tracking:** At the top of EVERY response during this workflow, print `[Git Ops: <operation> — Phase X]`.

---

## Operation Router

Parse `$ARGUMENTS` to determine the operation. If ambiguous, ask the user.

| Keyword / Argument | Operation | Jump to |
|---|---|---|
| `merge <source> [into <target>]` | Merge a branch | Section 1 |
| `rebase [<branch>] [onto <target>]` | Rebase a branch | Section 2 |
| `sync` or `update` or `catch-up` | Sync current branch with main/base | Section 3 |
| `conflicts` or `resolve` | Resolve merge/rebase conflicts | Section 4 |
| `cascade` or `stack` or `chain` | Manage stacked branch chain | Section 5 |
| `cherry-pick <commit(s)>` | Cherry-pick commits | Section 6 |
| `cleanup` or `prune` | Clean up merged/stale branches | Section 7 |
| `status` or (no arguments) | Full repo assessment | Section 8 |

---

## Phase 0: Safety Assessment (ALL operations)

**Run before every operation. No exceptions.**

```bash
# 1. Confirm we're in a git repo
git rev-parse --is-inside-work-tree

# 2. Capture current state for rollback
ORIGINAL_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --short HEAD)
ORIGINAL_SHA=$(git rev-parse HEAD)

# 3. Check for uncommitted work
git status --porcelain
```

### Decision Tree

```
Has uncommitted changes?
├─ Yes → Are they staged?
│   ├─ All staged → Ask: "You have staged changes. Commit first, stash, or abort?"
│   └─ Mixed/unstaged → Ask: "You have uncommitted changes. Stash, commit, or abort?"
│       → If user says stash: git stash push -m "git-ops-auto-stash-$(date +%s)"
│       → Track STASH_CREATED=true for cleanup
└─ No → Proceed
```

### Rollback Plan

Before any destructive step, print the rollback command:

```
[ROLLBACK] If anything goes wrong:
  git <operation> --abort   # (merge --abort / rebase --abort / cherry-pick --abort)
  git checkout <ORIGINAL_BRANCH>
  git reset --hard <ORIGINAL_SHA>
  <if STASH_CREATED> git stash pop
```

**Never execute rollback automatically.** Always present the plan and let the user decide.

---

## Section 1: Merge

### Phase 1.1: Pre-Merge Analysis

```bash
# Identify the branches
SOURCE=<source branch>
TARGET=<target branch, default: current branch>

# Check both branches exist
git rev-parse --verify "$SOURCE"
git rev-parse --verify "$TARGET"

# Preview what will be merged
git log --oneline "$TARGET".."$SOURCE"
git diff --stat "$TARGET"..."$SOURCE"

# Check for potential conflicts (dry run)
git merge-tree $(git merge-base "$TARGET" "$SOURCE") "$TARGET" "$SOURCE" 2>/dev/null
```

**Report to user:**
- Number of commits to merge
- Files changed (insertions/deletions)
- Predicted conflicts (if any)

### Phase 1.2: Merge Strategy Selection

Ask the user if not obvious:

| Strategy | When to use | Command |
|---|---|---|
| **Merge commit** (default) | Feature branch → main, preserves history | `git merge --no-ff` |
| **Fast-forward** | Clean linear history, branch is ahead | `git merge --ff-only` |
| **Squash** | Many small commits → single clean commit | `git merge --squash` |

### Phase 1.3: Execute

```bash
git checkout "$TARGET"
git merge <strategy-flag> "$SOURCE"
```

If conflicts arise → jump to **Section 4: Conflict Resolution**.

### Phase 1.4: Post-Merge

```bash
# Verify merge completed
git log --oneline -5
git diff --stat HEAD~1..HEAD

# Run project test suite if available (check package.json, Makefile, etc.)
# Report results to user
```

Ask: "Merge complete. Delete the source branch `<SOURCE>`?" (only if it's not main/master/develop)

---

## Section 2: Rebase

### Phase 2.1: Pre-Rebase Analysis

```bash
BRANCH=<branch to rebase, default: current>
ONTO=<target base, default: main>

# Count commits that will be replayed
git log --oneline "$ONTO".."$BRANCH" | wc -l

# Check for merge commits (rebase will linearize them — warn user)
git log --oneline --merges "$ONTO".."$BRANCH"

# Preview conflict likelihood
git diff --stat "$ONTO"..."$BRANCH"
```

**Report to user:**
- N commits will be replayed onto `<ONTO>`
- Warning if merge commits exist (they'll be flattened unless `--rebase-merges`)
- Files with high conflict risk

### Phase 2.2: Rebase Strategy

| Strategy | When | Flag |
|---|---|---|
| Standard | Linear commit history | (default) |
| Interactive squash | Clean up before merge | User must confirm; provide `git rebase -i` guidance |
| Preserve merges | Keep merge topology | `--rebase-merges` |

**Important:** Never use `git rebase -i` directly (interactive mode hangs the terminal). Instead, for squash/reorder operations, use `git rebase` with `GIT_SEQUENCE_EDITOR` to script the todo list:

```bash
# Example: squash all into first commit
GIT_SEQUENCE_EDITOR="sed -i '' '2,\$s/^pick/squash/'" git rebase -i "$ONTO"
```

Or guide the user to do the interactive rebase manually and offer to continue after.

### Phase 2.3: Execute

```bash
git checkout "$BRANCH"
git rebase "$ONTO"
```

If conflicts arise at any step → jump to **Section 4: Conflict Resolution** with `REBASE_MODE=true`.

### Phase 2.4: Post-Rebase

```bash
# Verify clean history
git log --oneline "$ONTO"..HEAD

# Check if remote tracking branch exists and diverges
git rev-list --left-right --count "$BRANCH"..."origin/$BRANCH" 2>/dev/null
```

If the branch was already pushed, warn:
```
[WARNING] Branch <BRANCH> has diverged from origin/<BRANCH>.
You will need to force-push: git push --force-with-lease origin <BRANCH>
This rewrites public history. Confirm? (yes/no)
```

**Always use `--force-with-lease`** (never `--force`) to prevent overwriting others' work.

---

## Section 3: Sync with Main

Update the current branch to include the latest changes from the base branch.

### Phase 3.1: Detect Base Branch

```bash
# Auto-detect main branch name
MAIN=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
if [ -z "$MAIN" ]; then
  # Fallback: check common names
  for candidate in main master develop; do
    if git rev-parse --verify "origin/$candidate" &>/dev/null; then
      MAIN=$candidate
      break
    fi
  done
fi

CURRENT=$(git symbolic-ref --short HEAD)

# Fetch latest
git fetch origin "$MAIN"
```

### Phase 3.2: Choose Strategy

```bash
# Check if current branch can fast-forward
BEHIND=$(git rev-list --count HEAD..origin/"$MAIN")
AHEAD=$(git rev-list --count origin/"$MAIN"..HEAD)
```

| Situation | Recommendation |
|---|---|
| Behind only (AHEAD=0) | Fast-forward merge: `git merge --ff-only origin/$MAIN` |
| Behind + ahead, clean | Rebase preferred: `git rebase origin/$MAIN` |
| Behind + ahead, shared branch | Merge preferred: `git merge origin/$MAIN` |

Ask the user which strategy to use, explain trade-offs. Default to rebase for personal branches, merge for shared branches.

### Phase 3.3: Execute

Run the chosen strategy. If conflicts → **Section 4**.

Post-sync, report: "Branch `<CURRENT>` is now up to date with `origin/<MAIN>`. You are N commits ahead."

---

## Section 4: Conflict Resolution

### Phase 4.1: Survey Conflicts

```bash
# List all conflicted files
git diff --name-only --diff-filter=U

# Count conflicts per file
for f in $(git diff --name-only --diff-filter=U); do
  echo "$f: $(grep -c '<<<<<<<' "$f") conflict(s)"
done
```

**Report:** "N files with M total conflicts. Starting with the most complex."

Sort files by conflict count (descending) — resolve hardest first so easy ones feel like progress.

### Phase 4.2: Resolve Each File

For each conflicted file:

1. **Read the full file** (not just the conflict markers — context matters)
2. **Identify each conflict block** between `<<<<<<<` and `>>>>>>>`
3. **Classify the conflict type:**

| Type | Description | Typical Resolution |
|---|---|---|
| **Additive** | Both sides added different things | Combine both additions |
| **Divergent edit** | Same lines changed differently | Semantic merge (understand intent) |
| **Delete vs. modify** | One side deleted, other modified | Usually keep the modification |
| **Structural** | File reorganized on one side | Requires careful manual merge |
| **Import/dependency** | Package or import list conflicts | Merge and deduplicate |

4. **Present the conflict** with both versions and a suggested resolution:

```
### Conflict 1/N in `path/to/file.ext`
Type: <conflict type>

<<<<<<< HEAD (current branch: <branch-name>)
<current code>
=======
<incoming code>
>>>>>>> <source>

**Suggested resolution:**
<merged code with explanation>

Options:
  (a) Use suggested resolution
  (b) Keep current (HEAD)
  (c) Keep incoming
  (d) Custom — describe what you want
```

5. **Apply the chosen resolution** — remove conflict markers, write the merged code
6. **Validate syntax** — if the file has an obvious syntax (JS, TS, Python, JSON, etc.), verify it parses:

```bash
# JavaScript/TypeScript
node -c "$file" 2>&1 || echo "SYNTAX ERROR — fix before continuing"

# Python
python -c "import ast; ast.parse(open('$file').read())" 2>&1

# JSON
python -c "import json; json.load(open('$file'))" 2>&1
```

### Phase 4.3: Complete Resolution

```bash
# Stage all resolved files
git add <resolved files>

# If we're in a rebase
if [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ]; then
  git rebase --continue
  # May hit more conflicts on next commit — loop back to 4.1
fi

# If we're in a merge
if [ -f .git/MERGE_HEAD ]; then
  git commit  # Uses the auto-generated merge commit message
fi

# If we're in a cherry-pick
if [ -f .git/CHERRY_PICK_HEAD ]; then
  git cherry-pick --continue
fi
```

### Conflict Resolution Rules

1. **Never blindly pick one side.** Always understand WHY both changes were made.
2. **Preserve intent, not just text.** If both sides added tests, keep both tests.
3. **Watch for semantic conflicts** — code that merges cleanly but breaks logic (e.g., both sides add a variable with the same name but different meaning). Read surrounding code.
4. **Test after resolving.** Run the project's test suite after all conflicts are resolved.

---

## Section 5: Stacked / Cascading Branches

Managing chains of dependent branches: `main → feature/A → feature/B → feature/C`

### Phase 5.1: Map the Chain

```bash
# Discover the branch chain by walking merge-base relationships
CURRENT=$(git symbolic-ref --short HEAD)

# Find main branch
MAIN=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
[ -z "$MAIN" ] && MAIN=main

# List all local branches and their upstream/parent relationships
git branch -vv --sort=-committerdate
```

Ask the user to confirm the chain order if ambiguous. Otherwise, detect it:

```bash
# For each branch pair, check if one is an ancestor of the other
git merge-base --is-ancestor <parent> <child> && echo "<parent> is ancestor of <child>"
```

**Output the chain as a diagram:**

```
Chain detected:
  main
   └── feature/A  (3 commits ahead of main, 0 behind)
        └── feature/B  (2 commits ahead of feature/A, 0 behind)
             └── feature/C  (1 commit ahead of feature/B, 0 behind)
```

### Phase 5.2: Cascade Operation Selection

| Operation | Description |
|---|---|
| `cascade sync` | Update the entire chain after main changed |
| `cascade rebase` | Rebase each branch onto its updated parent |
| `cascade merge` | Merge each parent into its child (preserves history) |
| `cascade status` | Show ahead/behind for each link in the chain |
| `cascade pr` | Create/update PRs for each branch targeting its parent |
| `cascade collapse` | After parent is merged to main, rebase children onto main |

### Phase 5.3: Cascade Sync (most common)

When `main` has been updated and you need to propagate changes through the chain:

```
Step 1: Update main
  git fetch origin main
  git checkout main
  git merge --ff-only origin/main

Step 2: For each branch in chain order (parent → child):
  git checkout <branch>
  git rebase <parent>
  → If conflicts: resolve (Section 4), then continue
  → If force-push needed: git push --force-with-lease origin <branch>

Step 3: Report status of each branch after sync
```

**Critical rule:** Always rebase in chain order (root → leaf). Never start from the leaf.

### Phase 5.4: Cascade Collapse

When a parent branch has been merged into `main` and the chain needs to be re-rooted:

```
Before:  main → feature/A (merged) → feature/B → feature/C
After:   main → feature/B → feature/C

Step 1: Confirm feature/A is fully merged into main
  git fetch origin main
  git log --oneline main..feature/A  # Should be empty

Step 2: Rebase feature/B onto main (skipping feature/A's commits)
  git checkout feature/B
  git rebase --onto main feature/A feature/B

Step 3: Rebase feature/C onto updated feature/B
  git checkout feature/C
  git rebase --onto feature/B <old-feature/B-tip> feature/C

Step 4: Delete the merged branch
  git branch -d feature/A
  git push origin --delete feature/A  # Ask user first
```

### Phase 5.5: Cascade PR Management

Create or update PRs for each link in the chain:

```bash
# For each branch in chain:
for i in "${!CHAIN[@]}"; do
  BRANCH="${CHAIN[$i]}"
  if [ $i -eq 0 ]; then
    BASE="$MAIN"
  else
    BASE="${CHAIN[$i-1]}"
  fi

  # Check if PR already exists
  EXISTING_PR=$(gh pr list --head "$BRANCH" --base "$BASE" --json number -q '.[0].number')

  if [ -n "$EXISTING_PR" ]; then
    echo "PR #$EXISTING_PR exists for $BRANCH → $BASE"
  else
    echo "Need to create PR: $BRANCH → $BASE"
    # Ask user for title/description, then:
    # gh pr create --base "$BASE" --head "$BRANCH" --title "..." --body "..."
  fi
done
```

After a cascade collapse, update PR base branches:
```bash
gh pr edit <number> --base main  # Re-target PR after parent was merged
```

---

## Section 6: Cherry-Pick

### Phase 6.1: Identify Commits

```bash
# If user gives commit hashes, verify they exist
git cat-file -t <commit-hash>

# If user gives a range or description, help find the commits
git log --oneline --all --grep="<search term>"
git log --oneline <branch> --since="<date>"
```

### Phase 6.2: Preview

```bash
# Show what each commit changes
for COMMIT in <commit-list>; do
  git log --format="%h %s" -1 "$COMMIT"
  git diff-tree --stat -r "$COMMIT"
done
```

### Phase 6.3: Execute

```bash
# Single commit
git cherry-pick <commit>

# Multiple commits (in order)
git cherry-pick <oldest>..<newest>

# Without committing (stage only)
git cherry-pick --no-commit <commit>
```

If conflicts → **Section 4** with cherry-pick mode.

---

## Section 7: Branch Cleanup

### Phase 7.1: Identify Candidates

```bash
# Fetch latest remote state
git fetch --prune origin

# Branches already merged into main
git branch --merged "$MAIN" | grep -v "^\*" | grep -v "$MAIN"

# Remote tracking branches that no longer exist
git branch -vv | grep ': gone]'

# Branches with no activity in 30+ days
git for-each-ref --sort=committerdate --format='%(committerdate:short) %(refname:short)' refs/heads/ | head -20
```

### Phase 7.2: Present Candidates

```
Branches safe to delete (fully merged into main):
  feature/old-feature     (merged 2 weeks ago)
  feature/another-thing   (merged 1 month ago)

Branches with dead remote tracking:
  feature/stale-branch    (remote deleted)

Branches with no recent activity (30+ days):
  feature/abandoned       (last commit: 2025-12-01)
  [WARNING: not merged — may contain unmerged work]
```

### Phase 7.3: Delete (with confirmation)

**Always ask before deleting.** Never auto-delete.

```bash
# Safe delete (only if merged)
git branch -d <branch>

# Force delete (unmerged — requires explicit user confirmation)
git branch -D <branch>

# Delete remote branch
git push origin --delete <branch>
```

---

## Section 8: Repository Status Assessment

Full health check of the repository's branch state.

```bash
# Current branch and position
git symbolic-ref --short HEAD
git log --oneline -1

# Ahead/behind main
MAIN=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
[ -z "$MAIN" ] && MAIN=main
git rev-list --left-right --count HEAD...origin/"$MAIN"

# All local branches with status
git branch -vv --sort=-committerdate

# Any in-progress operations
[ -d .git/rebase-merge ] && echo "REBASE IN PROGRESS"
[ -d .git/rebase-apply ] && echo "REBASE-APPLY IN PROGRESS"
[ -f .git/MERGE_HEAD ] && echo "MERGE IN PROGRESS"
[ -f .git/CHERRY_PICK_HEAD ] && echo "CHERRY-PICK IN PROGRESS"

# Stash list
git stash list

# Uncommitted changes
git status --short

# Open PRs for current repo
gh pr list --limit 10 2>/dev/null
```

**Output a structured summary:**

```
## Repository Status

Branch: feature/my-branch
Position: 5 commits ahead, 2 behind origin/main
Uncommitted: 3 modified files
In-progress: none
Stash: 1 entry

### Local Branches (sorted by activity)
  * feature/my-branch     (active, 5 ahead of main)
    feature/other          (active, 2 ahead of main)
    feature/old            (merged, safe to delete)

### Open PRs
  #42  feature/my-branch → main  (open, 2 reviews)
  #41  feature/other → main      (draft)
```

---

## Dangerous Operation Guardrails

These actions require **explicit user confirmation** before execution. Never proceed silently.

| Action | Risk | Confirmation prompt |
|---|---|---|
| `git push --force-with-lease` | Rewrites remote history | "This will rewrite history on `origin/<branch>`. Others pulling this branch will need to reset. Proceed?" |
| `git branch -D` (unmerged) | Loses unmerged commits | "Branch `<name>` has N unmerged commits. Deleting is irreversible. Proceed?" |
| `git push origin --delete` | Deletes remote branch | "This will delete `<branch>` from the remote. Other collaborators will lose access. Proceed?" |
| `git reset --hard` | Discards all changes | "This will permanently discard all uncommitted changes. Proceed?" |
| `git rebase` on shared branch | Rewrites shared history | "Branch `<name>` appears to be shared (has remote tracking + recent pushes). Rebasing will require force-push. Prefer merge instead?" |

---

## Error Recovery

### Merge gone wrong
```bash
git merge --abort        # Cancel in-progress merge
git reset --hard HEAD    # If merge was committed but wrong (ask user first)
```

### Rebase gone wrong
```bash
git rebase --abort       # Cancel in-progress rebase

# If rebase completed but result is wrong:
git reflog              # Find the pre-rebase commit
git reset --hard <pre-rebase-sha>  # Ask user first
```

### Cherry-pick gone wrong
```bash
git cherry-pick --abort  # Cancel in-progress cherry-pick
```

### General recovery
```bash
# The reflog is your safety net — it keeps 90 days of history
git reflog --date=relative | head -20
# Find the state you want to return to, then:
# git reset --hard <sha>  # Ask user first
```

---

## Quick Reference

```
OPERATION ROUTER:
  /git-ops merge <source> [into <target>]
  /git-ops rebase [<branch>] [onto <target>]
  /git-ops sync                              — update current branch from main
  /git-ops conflicts                         — resolve current conflicts
  /git-ops cascade sync                      — propagate main changes through chain
  /git-ops cascade collapse                  — re-root chain after parent merged
  /git-ops cascade status                    — show chain health
  /git-ops cascade pr                        — create/update PRs for chain
  /git-ops cherry-pick <commits>
  /git-ops cleanup                           — prune merged/stale branches
  /git-ops status                            — full repo assessment

SAFETY:
  Phase 0 runs ALWAYS — capture state, check for uncommitted work
  NEVER force-push without --force-with-lease
  NEVER delete branches without asking
  NEVER auto-execute rollback — present the command, let user decide

CASCADE ORDER:
  Always root → leaf (main → A → B → C), never leaf → root
  After parent merge: rebase --onto main <old-parent> <child>
  Update PR bases: gh pr edit <number> --base main

CONFLICT RESOLUTION:
  1. Read full file (not just markers)
  2. Classify conflict type (additive, divergent, structural)
  3. Present both sides + suggested merge
  4. Validate syntax after resolution
  5. Test after all conflicts resolved

RECOVERY:
  git <operation> --abort          — cancel in-progress operation
  git reflog                       — find any previous state
  git reset --hard <sha>           — restore (with user permission)
```

---

## Common Mistakes

| Mistake | Why it's wrong | What to do instead |
|---|---|---|
| Rebasing in leaf → root order | Child rebases are invalidated when parent rebases | Always rebase root → leaf |
| Using `--force` instead of `--force-with-lease` | Can overwrite someone else's push | `--force-with-lease` checks for upstream changes |
| Deleting branch before confirming merge | Unmerged commits are lost | `git branch --merged` first, then `-d` (not `-D`) |
| Resolving conflicts by always picking "ours" | Discards valid incoming changes | Read both sides, merge semantically |
| Rebasing shared/public branches | Forces all collaborators to reset | Merge instead for shared branches |
| Not fetching before operations | Working with stale remote state | `git fetch` before any cross-branch operation |
| Cascade sync without checking chain order | Breaks the chain, creates orphan commits | Map the full chain first (Phase 5.1) |
| Manual conflict marker cleanup without syntax check | Easy to leave broken syntax | Validate file after every resolution |
