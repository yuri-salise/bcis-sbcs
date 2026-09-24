# BCIS Subscription Billing and Collection System — Centralized Agent Skills Catalog

> **Scope:** Entire Workspace (Root Orchestration, Backend Repository, Frontend Repository)  
> **Status:** Active & Authoritative  
> **Precedence:** Explicit User Requirement > `PRODUCT.md` > Centralized `SKILLS.md` > Established Engineering Best Practice  

---

## 1. Operating Policy & Centralization Rule

This document is the **single authoritative skills catalog** for the entire project workspace.

- **Do NOT create `backend/SKILLS.md`**.
- **Do NOT create `frontend/SKILLS.md`**.
- All AI agents, subagents, and human developers operating within this workspace must consult this root specification before implementing features or modifying existing code.
- Skills must be installed globally or via the agent's supported environment mechanism. All required skills have been verified and installed into `~/.agents/skills/`.

---

## 2. Approved Skill Catalog

| Scope | Skill Name | Upstream Repository | Primary Purpose | Trigger / Workflow |
|---|---|---|---|---|
| **Global** | `caveman` | `JuliusBrussee/caveman` | Concise, terse, execution-focused responses while preserving paths, errors, code, and diffs | Communication efficiency layer |
| **Global** | `caveman-commit` | `JuliusBrussee/caveman` | Structured, concise Conventional Commit messages | Before committing to `backend/.git` or `frontend/.git` |
| **Global** | `caveman-review` | `JuliusBrussee/caveman` | Crisp, actionable code review findings | Pre-commit and PR review |
| **Global** | `caveman-compress` | `JuliusBrussee/caveman` | Instruction compression without loss of technical semantics | Documentation optimization |
| **Frontend** | `ui-ux-pro-max` | `nextlevelbuilder/ui-ux-pro-max-skill` | Desktop/web UI/UX patterns, typography, color palettes, accessibility guidelines | Initial design discovery & layout planning |
| **Frontend** | `impeccable` | `pbakaus/impeccable` | UI shaping, hierarchy, layout rhythm, spacing, visual audit & polish | Screen structure shaping & final polish |
| **Frontend** | `design-taste-frontend` | `jeettrench/taste-skill` | Anti-generic aesthetic refinement, visual composition, premium enterprise feel | Component aesthetic & typography elevation |
| **Frontend** | `emil-design-eng` | `emilkowalski/skills` | Interaction engineering, purposeful motion, easing curves, micro-interactions | Workflow-speed-preserving micro-interactions |

---

## 3. Strict Frontend Skill Precedence Pipeline

When designing or implementing major user interface screens, the four frontend design skills must be invoked in the following disciplined sequence to avoid design confusion or contradictory churn:

```text
Step 1: UI/UX Pro Max
        ↓ (Establish information architecture, desktop layout patterns, typography, palette, accessibility criteria)
Step 2: Impeccable
        ↓ (Define screen shape, visual hierarchy, spacing scale, layout density, form structures)
Step 3: Design Taste Frontend
        ↓ (Anti-generic visual refinement, distinctiveness, premium operational polish)
Step 4: Emil Kowalski (emil-design-eng)
        ↓ (Selective micro-interactions, subtle feedback, purposeful easing; never compromising speed)
Step 5: Implementation + Automated Verification
        ↓ (React 19 + TypeScript strict + Tailwind + shadcn/ui + Vitest component tests)
Step 6: Impeccable Audit & Polish
        ↓ (Final visual audit, contrast verification, keyboard navigation, density check)
```

### Precedence Resolution
When recommendations conflict:
1. `PRODUCT.md` requirements and business constraints are supreme.
2. Accessibility (WCAG 2.1 AA), security boundaries, and keyboard navigation override aesthetics.
3. Established design system tokens (`Operational Trust` palette: Navy `#0F2747`, Accent Blue `#2563EB`, Canvas `#F6F8FB`, Surface `#FFFFFF`, Inter font) override third-party recommendations.
4. No animation or decorative flourish may introduce latency into high-volume cashier or operational workflows.

---

## 4. Secondary & Complementary Skills

- **Anthropic Agent Skills (`frontend-design`, `webapp-testing`):**
  - Use for production-grade visual verification and browser-level workflow verification.
- **`obra/superpowers`:**
  - Follow core disciplines: test-driven development (TDD), systematic debugging, writing plans before execution, and verification before completion.
- **Caveman Communication Discipline:**
  - Caveman rules optimize communication brevity but **must never override safety checks, financial precision, database transactions, RBAC validation, or testing rigor**.

---

## 5. Verification Checklist

Before accepting any code changes:
- [ ] Backend: Authoritative domain rules enforced in application service, NOT in route handlers or client.
- [ ] Financials: All money operations use integer centavos or exact PostgreSQL `NUMERIC(14,2)`. No floating point.
- [ ] Database: Transactions wrap multi-step operations (`BEGIN...COMMIT`); unique and foreign key constraints exist.
- [ ] Authorization: Fastify RBAC permissions guard every endpoint; UI button hiding is only presentational.
- [ ] Desktop Boundary: Tauri capabilities locked down; client connects ONLY through Fastify REST API.
- [ ] Tests: Unit, integration, or component tests pass cleanly.
