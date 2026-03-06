---
name: ui-ux-improve
description: Analyze and improve UI/UX of React components. Use when the user asks to improve, polish, redesign, or review the UI/UX of any part of the application — including layout, accessibility, responsiveness, visual hierarchy, consistency, micro-interactions, and performance.
argument-hint: "[component-or-area]"
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(npm run build*, npm run lint*, npm test*)
context: fork
---

# UI/UX Improvement Skill

You are an expert UI/UX engineer. When invoked, audit the target component or area and apply improvements following the principles below. If `$ARGUMENTS` specifies a component or area, focus there; otherwise audit the full frontend.

---

## Step 1 — Audit

Before making any changes, read and understand the target code. Produce a short findings list covering each category below. Flag issues with severity: **critical** (breaks usability), **major** (hurts experience), **minor** (polish).

---

## Step 2 — Apply Improvements

Work through the categories in order. Each category includes the principle, what to look for, and how to fix it.

### 2.1 Visual Hierarchy & Layout

**Principle:** Users scan — they don't read. Guide the eye with size, weight, color, and spacing so the most important elements are noticed first.

- Headings should be visually distinct from body text (larger font, bolder weight).
- Primary actions (buttons, CTAs) must stand out from secondary/tertiary actions via size, color, or elevation.
- Group related elements with consistent spacing; use whitespace to separate unrelated groups.
- Align elements to a grid — avoid arbitrary padding or margin values.

### 2.2 Consistency & Design Tokens

**Principle:** Repeated patterns build familiarity. Inconsistency forces the user to re-learn the interface.

- Colors, font sizes, border radii, and spacing should come from a small set of reusable Tailwind classes or CSS variables — never one-off magic numbers.
- Interactive elements (buttons, links, inputs) must look and behave the same everywhere.
- Icon style (stroke width, size, fill vs outline) must be uniform — use a single icon library (lucide-react in this project).
- If a pattern appears 3+ times, extract it into a shared component under `components/shared/`.

### 2.3 Accessibility (WCAG 2.2 AA)

**Principle:** Accessible design is good design. It broadens the audience and often improves usability for everyone.

**Must check:**
- Color contrast ratio: at least 4.5:1 for normal text, 3:1 for large text.
- Every interactive element must be keyboard-focusable and have a visible focus indicator.
- Images and icons need `alt` text or `aria-label`; decorative icons use `aria-hidden="true"`.
- Form inputs must have associated `<label>` elements (or `aria-label`).
- Use semantic HTML: `<button>` for actions, `<a>` for navigation, `<nav>`, `<main>`, `<section>`, headings in order.
- ARIA roles and `aria-live` regions for dynamic content (toasts, status updates, loading states).
- Touch targets should be at least 44x44px.

### 2.4 Responsive Design

**Principle:** The interface must work on every viewport without horizontal scrolling or overlapping elements.

- Use Tailwind responsive prefixes (`sm:`, `md:`, `lg:`) — never fixed pixel widths on containers.
- Stack columns vertically on small screens; use grid/flex for larger screens.
- Text should remain readable (min 16px body) at all breakpoints.
- Test mentally at 320px, 768px, and 1280px widths.
- Modals and dropdowns must not overflow the viewport.

### 2.5 User Feedback & Micro-interactions

**Principle:** Every user action should produce an immediate, visible response. Silence feels broken.

- Buttons should have hover, active, focus, and disabled states.
- Loading states: use skeleton screens or spinners — never leave the UI frozen.
- Success/error states: provide clear, contextual feedback (inline messages, color changes, icons) — not just console logs.
- Transitions and animations: use `transition-*` and `duration-150`/`duration-200` Tailwind classes for smooth state changes. Avoid anything longer than 300ms.
- Destructive actions (delete, remove) require confirmation or an undo mechanism.

### 2.6 Simplicity & Cognitive Load

**Principle:** Every element that doesn't help the user is noise. Remove it.

- Limit choices per view — if there are more than 5-7 options, group or paginate.
- Labels and copy should be short, specific, and action-oriented ("Save company" not "Submit").
- Hide advanced options behind progressive disclosure (expandable sections, "More options" links).
- Avoid redundant information — don't show the same data in two places.
- Empty states should guide the user: explain what will appear and provide a CTA to get started.

### 2.7 Performance & Perceived Speed

**Principle:** Perceived performance matters more than actual performance. Make the app feel instant.

- Lazy-load below-the-fold content and heavy components with `React.lazy` + `Suspense`.
- Optimistic UI updates: update the UI immediately, reconcile with the server in the background.
- Debounce search/filter inputs (150-300ms).
- Avoid layout shifts — reserve space for images and async content.
- Use `useMemo`/`useCallback` only where profiling shows a real benefit — not by default.

### 2.8 Typography & Readability

**Principle:** Good typography is invisible — it lets the user focus on content, not decoration.

- Use a clear type scale: 2-3 font sizes for body, subheadings, and headings.
- Line height should be 1.4-1.6 for body text.
- Maximum line length: 60-80 characters for readability.
- Avoid all-caps for more than short labels; never use it for paragraphs.
- Ensure sufficient contrast between text and background.

### 2.9 Color & Theming

**Principle:** Color communicates meaning. Use it intentionally, not decoratively.

- Reserve red for errors/destructive actions, green for success, yellow/amber for warnings, blue for info/primary actions.
- Don't rely on color alone to convey information — pair with icons, text, or patterns.
- Use a cohesive palette: 1 primary color, 1 secondary, 1 accent, plus neutrals (grays).
- Background colors should provide enough contrast without being harsh (avoid pure black `#000` on pure white `#fff` — prefer `gray-900` on `white` or `gray-50`).

### 2.10 Navigation & Information Architecture

**Principle:** Users should always know where they are, where they can go, and how to get back.

- Active tabs/nav items must be visually distinct.
- Breadcrumbs or clear page titles for multi-level navigation.
- Consistent placement of navigation elements across views.
- Don't nest navigation more than 2 levels deep.

---

## Step 3 — Validate

After making changes:

1. Run `npm run lint` — must produce 0 warnings.
2. Run `npm run build` — must produce 0 errors, 0 warnings.
3. Run `npm test -- --watchAll=false` — all tests must pass.
4. Verify no existing tests broke due to changed class names, structure, or props.
5. If you added new interactive patterns, add tests for them.

---

## Rules

- Follow the project's existing architecture: components receive props only, no direct hook/service imports.
- Use Tailwind CSS v3 utility classes — no inline styles, no custom CSS unless absolutely necessary.
- Use `lucide-react` for all icons — don't introduce another icon library.
- Don't over-engineer: if a simple Tailwind class solves it, don't create a wrapper component.
- Don't change functionality — this skill is about presentation and interaction, not business logic.
- Preserve all existing test coverage — don't break tests with structural changes.
- Keep changes focused: if the audit reveals 20 issues, batch them into reviewable groups (max ~8 files per PR as per project rules).
