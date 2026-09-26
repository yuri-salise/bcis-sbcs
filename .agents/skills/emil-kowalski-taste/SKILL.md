---
name: emil-kowalski-taste
description: "Design engineering, micro-interactions, purposeful animation, and aesthetic taste inspired by Emil Kowalski and Agents with Taste. Eliminates AI defaults with tactile feedback, refined motion physics, and anti-generic visual polish."
---

# Emil Kowalski (Agents with Taste) Protocol

## Directives

### 1. Anti-Default & Trained Taste
- **Reject AI Defaults:** Never rely on boilerplate templates, generic centered hero layouts, or AI-purple gradients. Design with distinct visual rhythm, deliberate asymmetry when appropriate, and intentional hierarchy.
- **Unseen Details Compound:** Small, invisible details (consistent margins, balanced whitespace, subtle borders) aggregate to make interfaces feel polished and trustworthy.
- **Beauty as Leverage:** In a landscape of functional parity, craft and tactile feel are primary differentiators.

### 2. Animation & Motion Engineering
- **Purpose-Driven Motion:** Never animate decoratively if it introduces friction or latency to operational or cashier workflows. Motion must explain spatial relationships or provide immediate state feedback.
- **Springs & Curves:**
  - Avoid generic `transition: all 300ms`. Always specify exact properties (e.g., `transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1), opacity 150ms ease-out`).
  - Never animate entering elements from `scale(0)` (which feels unnatural); start from `scale(0.95)` with fade-in.
  - Use `ease-out` for exits or interactive responses; reserve `ease-in` only for elements leaving the screen permanently without user interaction.
- **Transform & Origin Awareness:**
  - Dropdowns, menus, and popovers must scale from their trigger element (`transform-origin: var(--radix-popper-transform-origin, top left)`), whereas modal dialogs remain centered.
  - Only animate composite properties (`transform`, `opacity`) to ensure 60fps/120fps hardware acceleration.

### 3. Tactile Micro-Interactions
- **Responsive Press States:** Every clickable button, card, and row must provide immediate tactile feedback on `:active` (e.g., `transform: scale(0.98)` or `active:translate-y-[1px]`).
- **Tooltip Ergonomics:** Skip enter delay on subsequent tooltip hovers within a short time window.
- **Masking State Shifts:** Use `@starting-style` and subtle backdrop blurs (`backdrop-blur-sm`) to smooth asynchronous data reveals and dialog appearances.

### 4. Review & Audit Protocol
When evaluating component interactions or styling pull requests, format critiques using an explicit Before/After/Why table:

| Before | After | Why |
|---|---|---|
| `transition: all 300ms` | `transition: transform 150ms ease-out, opacity 150ms ease-out` | Eliminates sluggish layout thrashing; explicitly animates composited properties. |
| `scale(0)` entry | `scale(0.95)` with `opacity: 0` entry | Natural physical manifestation rather than appearing from a pinhole. |
| Missing `:active` | `active:scale-[0.98] transition-transform duration-75` | Provides instant tactile press feedback to the user. |
