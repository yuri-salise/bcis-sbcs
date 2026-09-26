---
name: ui-ux-pro-max
description: "Comprehensive UI/UX design intelligence. Enforces WCAG accessibility standards, responsive desktop/mobile layouts, balanced typographic scales, curated color palettes, and information architecture."
---

# UI UX Pro Max Protocol

## Directives

### 1. Hierarchy & Priority Framework
Follow the priority checklist (1 → 10) when designing, refactoring, or auditing UI components:

1. **Accessibility (WCAG 2.1 AA - Critical):** Contrast ≥ 4.5:1 for body text (≥ 3:1 for large/bold text); required `focus-visible` rings on all interactive elements; `aria-label` on icon-only buttons.
2. **Touch & Interaction (Critical):** Minimum target size of 44×44px; minimum 8px tap spacing; immediate visual loading feedback on submission.
3. **Performance & Stability (High):** Prevent Cumulative Layout Shift (CLS < 0.1); reserve space for images and async blocks; avoid layout thrashing.
4. **Style Consistency (High):** Consistent visual language matching the product domain; SVG icons only (never use emojis as interface icons).
5. **Layout & Responsive (High):** Strict responsive reflow without horizontal scrolling; fluid container scaling with max-width boundaries.
6. **Typography & Hierarchy (Medium):** Strict scale (1.25 / 1.333 ratio); minimum 16px body text; 1.5 body line-height; tabular figures (`tabular-nums`) for currency and numeric data.
7. **Animation & Motion (Medium):** Purpose-driven transitions (150–250ms); respect `prefers-reduced-motion`; never animate width or height directly.
8. **Forms & Feedback (Medium):** Always visible input labels; inline error messages anchored directly below the invalid field; helper text where format is strict.
9. **Navigation Patterns (High):** Predictable keyboard Escape/Back handling; clear active navigation indicators; breadcrumbs for deep hierarchical structures.
10. **Data & Visualization (Low):** Accessible charts with distinct textures/patterns in addition to color; clear legends and tooltips.

### 2. Operational Anti-Patterns (Zero Tolerance)
- No gray-on-gray unreadable low-contrast text.
- No inputs relying solely on placeholder text for field labeling.
- No buttons without hover, active, and focus-visible state differentiation.
- No unhandled empty or error states in data tables or list views.

### 3. Search & Intelligence Tool
To query specific guidelines, palettes, font pairings, or component patterns from the design database:
```bash
py -3 "%USERPROFILE%/.agents/skills/ui-ux-pro-max/scripts/search.py" "<query>" --domain <ux|style|color|typography|chart|stack>
```
