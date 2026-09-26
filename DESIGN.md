# BCIS Subscription Billing & Collection System — Design System Specification

> **Status:** Active & Authoritative Grounding Reference  
> **Aesthetic Profile:** Enterprise Operational Trust  
> **Target Form Factor:** Desktop (1280px+ primary, min 1024px) & Local Cashier Terminal  

---

## 1. Brand & Color Palette ("Operational Trust")

All colors are defined as CSS variables in `frontend/src/styles/globals.css` and mapped to Tailwind utilities.

| Token Name | CSS Variable | Hex Value | Role / Usage |
|---|---|---|---|
| **Primary Navy** | `--color-primary-navy` | `#0F2747` | Primary brand headers, sidebars, authoritative badges |
| **Accent Blue** | `--color-accent-blue` | `#2563EB` | Interactive call-to-actions, active navigation highlights |
| **Canvas** | `--color-canvas` | `#F6F8FB` | High-readability app background layer |
| **Surface** | `--color-surface` | `#FFFFFF` | Cards, modals, data tables, elevated containers |
| **Text Primary** | `--color-text-primary` | `#0F172A` | Core body text, table cells, primary titles (WCAG AAA) |
| **Text Secondary** | `--color-text-secondary` | `#64748B` | Labels, metadata, helper text, timestamps (WCAG AA) |
| **Success** | `--color-success` | `#059669` | Paid status, positive reconciliation, connected devices |
| **Warning** | `--color-warning` | `#D97706` | Approaching deadlines, partial payments, backup notices |
| **Danger** | `--color-danger` | `#DC2626` | Delinquent accounts, disconnect orders, critical errors |
| **Border** | `--color-border` | `#E2E8F0` | Subtle container lines, table dividers, card outlines |
| **Muted Surface** | `--color-muted-surface` | `#F1F5F9` | Table alternate rows, disabled inputs, skeleton base |

---

## 2. Typography Scale

- **Primary Font Family:** `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- **Monospace / Financial:** `font-mono tabular-nums` (Required for all monetary figures, invoice numbers, account codes, and timestamps).

| Scale Level | Tailwind Class | Font Size / Line Height | Font Weight | Intended Purpose |
|---|---|---|---|---|
| Display | `text-2xl font-bold` | 24px / 32px | Bold (700) | Dashboard executive headers |
| Section Title | `text-xl font-semibold` | 20px / 28px | SemiBold (600) | Card headings, modal headers |
| Subheading | `text-lg font-medium` | 18px / 26px | Medium (500) | Table section titles, form groupings |
| Body (Base) | `text-sm font-normal` | 14px / 20px | Regular (400) | Primary table records, form inputs, labels |
| Caption / Metadata | `text-xs font-medium` | 12px / 16px | Medium (500) | Timestamps, status pills, audit tags |

---

## 3. Spacing, Grid & Border Radii

- **Grid Unit:** 8pt/4pt mathematical grid (`p-2` = 8px, `p-3` = 12px, `p-4` = 16px, `p-6` = 24px).
- **Border Radii:**
  - Badges & Pills: `rounded-full`
  - Form Controls & Buttons: `rounded-md` (6px)
  - Cards & Modals: `rounded-lg` (8px)
  - Anti-Slop Constraint: Never double-nest rounded cards with identical radii.
- **Z-Index Layering Standards:**
  - Base Layout / Content: `z-0`
  - Sticky Headers & Table Headers: `z-10`
  - Dropdowns & Popovers: `z-20`
  - Slide-over Drawers: `z-30`
  - Modal Backdrops & Dialogs: `z-40`
  - Toast Notifications: `z-50`

---

## 4. Component State Standards

Every interactive element (Buttons, Form Controls, Table Rows) must explicitly implement 6 states:
1. **Default:** Stable resting appearance with adequate contrast.
2. **Hover:** Subtle background shift (`hover:bg-slate-100` or `hover:brightness-95`).
3. **Active / Pressed:** Physical press down feedback (`active:scale-[0.98]` or `active:translate-y-[1px]`).
4. **Focus-Visible:** Accessible 2px offset ring (`focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none`).
5. **Loading / Skeleton:** Dimension-matching skeleton pulse (`animate-pulse bg-slate-200`) without layout shift.
6. **Empty / No Data:** Dedicated empty state illustration or guidance text; never display blank viewports.
