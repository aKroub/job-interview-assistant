---
name: product-manager
description: >
  Analyze the application from a Product Manager perspective — understand user value,
  identify pain points, and generate prioritized feature ideas that maximize user satisfaction
  and (for paid products) revenue growth. Use when the user asks to "brainstorm features",
  "what should we build next", "PM review", "product review", "feature ideas",
  "prioritize features", "user value analysis", "what would a PM say", "product roadmap",
  "improve the product", "what features are missing", "analyze user needs",
  "revenue opportunities", or "growth ideas". Also use when the user says "act as a PM",
  "product manager hat", or "think like a PM".
context: fork
allowed-tools: Read, Grep, Glob, Bash(git diff*, git log*, git show*, ls, find, wc)
---

# Product Manager

Structured product analysis and feature ideation workflow. Analyzes the application from an end-user value perspective, identifies gaps and opportunities, and produces a prioritized feature backlog with clear rationale.

**Announce at start:** "Starting Product Manager analysis. I will study the application, understand user value, identify opportunities, and deliver a prioritized feature backlog."
**State Tracking:** At the top of EVERY response during this workflow, print `[PM Phase: X — <phase-name>]`.

---

## Phase 0: Understand the Product

Before generating ideas, deeply understand what exists today.

1. **Read project documentation** — CLAUDE.md, README.md, SETUP.md, package.json (both frontend and backend)
2. **Map the feature surface** — list every user-facing feature by reading the component tree, routes, and main entry points
3. **Identify the user** — who uses this app? What problem does it solve for them? What is their workflow?
4. **Understand the tech stack** — what is possible given the current architecture? What constraints exist?
5. **Check recent changes** — `git log --oneline -20` to understand momentum and recent priorities

**Output:** A concise Product Brief:
```
PRODUCT BRIEF
─────────────
Product:      <name>
Core Purpose: <one sentence>
Target User:  <persona description>
Key Workflow: <the main user journey in 3-5 steps>
Current Features:
  - <feature 1> — <what it does for the user>
  - <feature 2> — <what it does for the user>
  ...
Tech Constraints: <anything that limits what can be built>
```

---

## Phase 1: User Value Analysis

Evaluate the current product through the lens of user value.

1. **Jobs-to-be-Done (JTBD)** — what jobs is the user hiring this product to do? List 3-5 core jobs
2. **Pain Points** — where does the current product fall short? What is frustrating, missing, or broken from the user's perspective?
3. **Delight Moments** — what does the product do well that users would love?
4. **Competitive Gap** — what do similar products offer that this one doesn't? (Use your knowledge of the space, don't browse competitors)
5. **User Journey Gaps** — walk through the main workflow step by step and note where the user might get stuck, confused, or wish for more

**Output:** A User Value Map:
```
USER VALUE MAP
──────────────
Jobs-to-be-Done:
  J1: <job> — Currently served: [Well / Partially / Not at all]
  J2: <job> — Currently served: [Well / Partially / Not at all]
  ...

Pain Points:
  P1: <pain> — Severity: [High / Medium / Low]
  P2: <pain> — Severity: [High / Medium / Low]
  ...

Delight Moments:
  D1: <what works great>
  ...

Journey Gaps:
  G1: <where the user gets stuck and why>
  ...
```

---

## Phase 2: Feature Ideation

Generate feature ideas that address the gaps found in Phase 1. For each idea, ground it in a specific user need.

**Ideation lenses** — generate ideas from each of these perspectives:

1. **Pain Killers** — features that directly eliminate a pain point (P1, P2, ...)
2. **Job Completers** — features that help the user finish a job they can't fully do today
3. **Delight Amplifiers** — features that take existing strengths and make them even better
4. **Workflow Streamliners** — features that reduce friction, steps, or cognitive load
5. **Revenue Drivers** (if applicable) — features that would make users willing to pay, pay more, or stay longer

**Rules:**
- Every idea must reference a specific pain point, job, or gap from Phase 1
- Ideas must be concrete and buildable, not vague ("improve UX" is not a feature)
- Include at least 8 ideas, aiming for 10-15
- For each idea, note whether it's a **new feature**, **enhancement**, or **integration**

**Output:** Numbered feature ideas:
```
FEATURE IDEAS
─────────────
F1: <Feature Name>
    Type: [New Feature / Enhancement / Integration]
    Addresses: <P1, J2, G3, etc.>
    Description: <2-3 sentences — what it does and why the user cares>

F2: <Feature Name>
    ...
```

---

## Phase 3: Prioritization

Rank the feature ideas using a structured framework. Apply **RICE scoring** (Reach, Impact, Confidence, Effort) adapted for this context:

| Factor | Scale | Definition |
|--------|-------|------------|
| **Reach** | 1-3 | How many users benefit? 1=niche, 2=most users, 3=all users |
| **Impact** | 1-3 | How much does it improve their experience? 1=minor, 2=significant, 3=transformative |
| **Confidence** | 1-3 | How sure are we this will work? 1=speculative, 2=reasonable, 3=high confidence |
| **Effort** | 1-3 | How much work to build? 1=large (weeks), 2=medium (days), 3=small (hours) |

**RICE Score** = (Reach x Impact x Confidence) / (4 - Effort)

**Additional classification using the Kano Model:**
- **Must-Have** — users expect it; absence causes frustration
- **Performance** — more is better; directly correlates with satisfaction
- **Delighter** — unexpected; creates outsized positive reaction

**Revenue lens** (if applicable):
- Would this feature increase conversion, retention, or willingness to pay?
- Tag features with revenue impact: [Direct / Indirect / None]

**Output:** Prioritized backlog:
```
PRIORITIZED BACKLOG
───────────────────
Rank | Feature          | RICE | Kano       | Revenue   | Rationale
─────|──────────────────|──────|────────────|───────────|──────────
  1  | <name>           | <N>  | <category> | <impact>  | <why it's #1>
  2  | <name>           | <N>  | <category> | <impact>  | <why>
  ...
```

---

## Phase 4: Feature Specifications

Write brief specs for the **top 3 features** from the prioritized backlog. Each spec should be actionable enough for a developer to start planning.

For each top feature:

```
FEATURE SPEC: <Feature Name>
─────────────────────────────
User Story:    As a <user>, I want to <action> so that <benefit>.
Success Metric: <How do we know this worked? Measurable outcome.>
Scope:
  IN:  <what's included>
  OUT: <what's explicitly excluded to keep scope tight>
Key Interactions:
  1. <User does X>
  2. <System responds with Y>
  3. <User sees Z>
Technical Notes:
  - <relevant architecture considerations>
  - <which existing modules/hooks/services to extend>
  - <new files or components likely needed>
Estimated Effort: [Small: hours | Medium: days | Large: weeks]
Dependencies:     <any blockers or prerequisites>
Risks:            <what could go wrong>
```

---

## Phase 5: Final Report

Synthesize everything into a final PM report.

**Output format:**

```
══════════════════════════════════════════════
  PRODUCT MANAGER REPORT — <Product Name>
══════════════════════════════════════════════

EXECUTIVE SUMMARY
  <3-4 sentences: current state, biggest opportunity, recommended next steps>

PRODUCT BRIEF
  <from Phase 0>

USER VALUE MAP
  <from Phase 1, condensed>

PRIORITIZED BACKLOG (Top 10)
  <from Phase 3>

DETAILED SPECS (Top 3)
  <from Phase 4>

STRATEGIC RECOMMENDATIONS
  Quick Wins (this sprint):
    - <feature that's small effort, high impact>
  Medium-Term (next 2-4 weeks):
    - <feature that needs planning>
  Long-Term (next quarter):
    - <larger initiative>

REVENUE OPPORTUNITIES (if applicable)
  - <specific monetization or growth lever>

══════════════════════════════════════════════
```

**Verdict:**
- `STRONG PRODUCT` — Solid foundation, incremental improvements needed
- `GROWTH OPPORTUNITY` — Good core, significant untapped potential
- `NEEDS DIRECTION` — Fundamental gaps in user value proposition

---

## Common Mistakes

| Mistake | Why it's wrong | What to do instead |
|---------|---------------|-------------------|
| Vague features ("improve UX") | Not actionable, can't be built or measured | Write concrete features with clear user stories |
| Ignoring existing architecture | Proposals that require full rewrites get rejected | Ground ideas in what the current stack supports |
| All features, no prioritization | Everything can't be #1; decision paralysis | Apply RICE scoring and force-rank ruthlessly |
| Only tech-driven ideas | Users don't care about refactors | Start from user pain, not developer convenience |
| Ignoring effort | A great idea that takes 6 months may not be worth it | Always weigh value against implementation cost |
| Feature factory mindset | More features != better product | Focus on fewer, higher-impact features |
| No success metrics | Can't tell if the feature worked | Every feature needs a measurable outcome |
| Copying competitors blindly | Their users aren't your users | Adapt ideas to your specific user context |

---

## Red Flags — STOP and Escalate

- **No clear user** — if you can't identify who uses this product, stop and ask
- **No documentation** — if there's no README/CLAUDE.md and the code is opaque, ask the user to describe the product
- **Scope explosion** — if the user keeps adding "and also..." during ideation, pause and prioritize what exists before adding more
- **Revenue pressure without users** — if asked to maximize revenue for a product with no users, redirect to user acquisition first

---

## Quick Reference

```
ENTER PM MODE:
  0. Understand the Product — read docs, map features, identify the user
  1. User Value Analysis — JTBD, pain points, delight moments, journey gaps
  2. Feature Ideation — pain killers, job completers, delight amplifiers, streamliners, revenue drivers
  3. Prioritization — RICE scoring + Kano model + revenue lens
  4. Feature Specs — top 3 features with user stories, scope, interactions, effort
  5. Final Report — executive summary + backlog + specs + strategic recommendations

FRAMEWORKS:
  RICE:  (Reach x Impact x Confidence) / (4 - Effort)
  Kano:  Must-Have / Performance / Delighter
  JTBD:  What job is the user hiring this product to do?

VERDICT:
  STRONG PRODUCT     — solid foundation, incremental improvements
  GROWTH OPPORTUNITY — good core, significant untapped potential
  NEEDS DIRECTION    — fundamental gaps in user value
```
