# BCIS Subscription Billing and Collection System — Product & Implementation Blueprint

> **Document type:** Product Requirements + Production-Ready Implementation Plan
> **Project:** BCIS Subscription Billing and Collection System
> **Target:** Windows desktop application for a 3-PC office LAN
> **Primary architecture:** Tauri desktop clients → Fastify API server → PostgreSQL
> **Repository strategy:** **Two separate Git repositories** — `frontend/` and `backend/`, both centralized under one workspace root; **not a monorepo**
> **Status:** Implementation baseline
> **Last reviewed:** 2026-09-24

---

## 0. AGENT BOOTSTRAP — DO THIS BEFORE WRITING PROJECT CODE

This project is intentionally built with AI-assisted development, but every generated change must be reviewed, tested, and understood by the developer. Do not immediately start creating application files.

### 0.1 Install proven Agent Skills first

Before implementation, inspect the current agent runtime and install compatible skills/plugins from reputable public repositories. Prefer upstream, actively maintained repositories with clear ownership, licensing, and documentation. Do not install random skill collections merely because they are popular.

The project uses **one centralized skill policy at the workspace root**. Skills may be installed globally or through the agent's native mechanism, but their usage and precedence are documented in the root `SKILLS.md`. Do not create separate skill catalogs inside `backend/` or `frontend/`.

**Core engineering skill sources:**

1. **Anthropic Agent Skills**
   - Repository: https://github.com/anthropics/skills
   - Use especially for:
     - `frontend-design` — production-grade visual direction, typography, palette, layout and intentional UI design.
     - `webapp-testing` — Playwright-based UI verification where applicable.

2. **obra/superpowers**
   - Repository: https://github.com/obra/superpowers
   - Use especially for:
     - brainstorming
     - writing-plans
     - test-driven-development
     - systematic-debugging
     - verification-before-completion
     - requesting-code-review
     - subagent-driven-development
     - using-git-worktrees
   - Follow its design-before-implementation, test-first, debugging, review, and verification discipline.

3. **GitHub Awesome Copilot Skills**
   - Repository: https://github.com/github/awesome-copilot
   - Use as a secondary source for architecture, codebase analysis, testing, security, and performance skills when appropriate for the active agent.

4. **Caveman**
   - Repository: https://github.com/JuliusBrussee/caveman
   - Purpose: reduce repetitive AI-agent prose and provide terse, execution-focused coding-agent behavior while preserving code, commands, file paths, and exact errors.
   - Required skill set to consider installing:
     - `caveman` — concise agent responses.
     - `caveman-commit` — concise Conventional Commit generation.
     - `caveman-review` — concise code-review findings.
     - `caveman-compress` — compress verbose project instruction files while preserving technical meaning.
   - Recommended skills-compatible installation:

```bash
npx skills add JuliusBrussee/caveman --skill '*' -g
```

   - Use Caveman primarily as a communication/output-efficiency layer. It must **never override project safety rules, financial rules, testing requirements, security review, or verification requirements**.
   - The Caveman project documents the small skill and additional `/caveman-commit`, `/caveman-review`, and `/caveman-compress` workflows.

**Frontend design-engineering skills — frontend repository only:**

5. **Impeccable**
   - Repository: https://github.com/pbakaus/impeccable
   - Use for frontend interface shape, hierarchy, typography, spacing, layout, accessibility, interaction design, responsive behavior, visual audits, critique, polishing, and production-grade UI refinement.
   - Primary use in this project:
     - `shape` before implementing a new major screen
     - `critique` during UX review
     - `audit` for technical/UI quality checks
     - `polish` before release
   - Do not use it for backend-only work. The upstream skill explicitly targets production frontend interface design and review.
   - Installation example:

```bash
npx skills add https://github.com/pbakaus/impeccable --skill impeccable
```

6. **UI/UX Pro Max**
   - Repository: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
   - Use for systematic UI/UX research and decision support: styles, palettes, typography, UX guidelines, charts, accessibility, design systems, and stack-specific guidance for desktop/web interfaces.
   - Use it before major frontend design decisions, not as a replacement for product requirements.
   - Recommended installation:

```bash
npx skills add https://github.com/nextlevelbuilder/ui-ux-pro-max-skill --skill ui-ux-pro-max --yes
```

   - The upstream project provides a dedicated `ui-ux-pro-max` skill for web/mobile/**desktop** UI and maintains searchable design guidance.

7. **Emil Kowalski Design Skills**
   - Repository: https://github.com/emilkowalski/skills
   - Primary skill: `emil-design-eng`
   - Use for design-engineering quality, component polish, interaction details, animation decisions, motion quality, easing, and subtle details that make the product feel intentional.
   - Recommended installation:

```bash
npx skills@latest add emilkowalski/skills
```

   - Use the animation-related skills selectively. This is an operational desktop application, so motion must remain purposeful, fast, accessible, and subordinate to workflow efficiency.

8. **Taste Skill**
   - Repository: https://github.com/jeettrench/taste-skill
   - Skill name: `design-taste-frontend`
   - Use as an anti-generic/anti-slop frontend design layer: stronger visual decisions, hierarchy, composition, spacing, typography, and premium product feel.
   - Recommended installation:

```bash
npx skills add https://github.com/jeettrench/taste-skill --skill design-taste-frontend
```

   - The skill's upstream project describes `design-taste-frontend` as its general all-rounder for premium frontend output.

### 0.1.1 Frontend skill precedence

The four frontend skills intentionally overlap. Do not ask all four to independently redesign the same screen. Use them in a controlled sequence:

```text
UI/UX Pro Max
    ↓
Design intent, palette, typography, UX patterns, stack guidance
    ↓
Impeccable
    ↓
Shape, structure, hierarchy, accessibility, audit
    ↓
Taste Skill
    ↓
Distinctiveness, anti-slop refinement, visual composition
    ↓
Emil Kowalski
    ↓
Motion, interaction polish, easing, micro-interactions
    ↓
Implementation + tests
    ↓
Impeccable audit/polish
```

When skills disagree, the precedence is:

```text
PRODUCT.md / explicit product requirements
        >
Accessibility + security + usability constraints
        >
Established design system decisions
        >
UI/UX Pro Max research
        >
Impeccable / Taste / Emil recommendations
```

No design skill may introduce unnecessary animation, visual noise, workflow friction, or accessibility regressions merely to make the interface look more impressive.

### 0.2 Installation rule

Detect the active agent first. Do **not** blindly execute commands for a different coding harness.

Recommended compatibility targets:

- **Claude Code:** install `superpowers`; install the Anthropic skills plugin/example skills and verify that `frontend-design` and `webapp-testing` are available.
- **Codex:** use the available plugin/skill marketplace support for Superpowers or load compatible Agent Skills into the agent's supported skills location.
- **GitHub Copilot:** use the `copilot skill` command or `.github/skills/` as appropriate, and consult `github/awesome-copilot` for compatible skills.
- **Other agents:** follow their native Agent Skills/plugin installation mechanism; do not invent an unsupported command.

### 0.3 Required agent behavior after installation

The agent must:

1. Read this `PRODUCT.md` before making project changes.
2. Read the laboratory specification and preserve all mandatory business rules.
3. Read the centralized root `SKILLS.md` before editing either child repository.
4. Inspect the existing repository state before editing anything.
5. Use design/planning skills before feature implementation.
6. Use TDD for business-rule changes and bug fixes unless the change is configuration-only.
7. Never make financial, authorization, database, or security changes without tests.
8. Never claim a feature works without running the relevant verification commands.
9. Keep the frontend and backend repositories independent but synchronized through the versioned API contract.
10. Never put secrets, real subscriber data, real GCash information, production passwords, or private customer evidence into AI prompts, commits, issues, or sample fixtures.

### 0.4 Do not "build the whole system" in one agent prompt

Work feature-by-feature. Every implementation task must follow this loop:

```text
Requirement
   ↓
Business rule + acceptance criteria
   ↓
Affected domain / API / database / UI analysis
   ↓
Test design
   ↓
Failing test
   ↓
Minimal implementation
   ↓
Refactor
   ↓
Integration test
   ↓
UI workflow verification
   ↓
Security / financial review
   ↓
Documentation update
   ↓
Meaningful commit
```

---

## 1. PRODUCT VISION

Build a small production-style business system for Bukidnon Cable and Internet Services (BCIS) that manages subscribers, service accounts, monthly billing, payment collection, subscriber ledgers, GCash verification, collectors, remittances, overdue receivables, suspension/reconnection, management reporting, auditing, and backup/restore.

The system must feel like a professional commercial ISP billing and operations application rather than a student CRUD demo.

The laboratory specification explicitly targets three simultaneous Windows office PCs and requires all operational access to pass through an API server instead of allowing clients to access PostgreSQL directly.

### 1.1 Product goals

- Financially correct billing and payment workflows.
- Immutable historical financial records with controlled reversal/adjustment workflows.
- Reliable concurrent operation for three office clients.
- Fast subscriber search and cashier workflows.
- Secure server-side authorization.
- Complete subscriber ledger and Statement of Account.
- Clear collection accountability for field collectors.
- Accurate accounts receivable and aging.
- Audit-ready reports.
- Professional, consistent desktop UX.
- Restore-tested backups.
- Maintainable code that students can explain during defense.

### 1.2 Non-goals for the first production-ready academic release

Do not spend time on optional features before all mandatory workflows are correct.

Deferred features include:

- collector mobile/PWA
- SMS/email automation
- customer self-service portal
- official online payment gateway
- GIS mapping
- advanced churn prediction
- revenue forecasting
- route optimization
- full technician inventory/work-order platform

These may be added only after mandatory financial, security, testing, reporting, and documentation requirements are complete.

---

## 2. SOURCE REQUIREMENTS — NON-NEGOTIABLE BUSINESS RULES

The provided laboratory specification establishes the following architecture, financial, security, reporting, and UI requirements.

### 2.1 Runtime architecture

```text
┌──────────────────────┐
│ PC 1 Owner / Admin   │
│ Tauri + React        │
└──────────┬───────────┘
           │
┌──────────────────────┐
│ PC 2 Cashier         │
│ Tauri + React        │
└──────────┬───────────┘
           │             LAN
┌──────────────────────┐ │
│ PC 3 Operations      │─┘
│ Tauri + React        │
└──────────┬───────────┘
           │ HTTPS/HTTP within trusted LAN with server auth
           ▼
┌─────────────────────────────────┐
│ BCIS Fastify API Server         │
│ Auth / RBAC / Domain / Reports  │
│ Validation / Audit / Logging    │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│ PostgreSQL                      │
│ Source of truth                 │
└─────────────────────────────────┘

Side services/storage on the server:
- proof attachments
- generated reports / temporary files
- database backups
- structured logs
```

### 2.2 Architecture rules

- Tauri WebView/frontend **must never** connect to PostgreSQL.
- Keep Tauri capabilities minimal and explicitly scoped.
- Do not expose unrestricted filesystem, shell, process, or OS APIs to the frontend.
- Use Tauri commands/plugins only when a desktop capability is actually required, and restrict them through capability permissions/scopes.
- Keep business logic and authoritative financial operations in the Fastify API, not in the Tauri Rust layer.
- All external input is validated with Zod.
- Authorization is enforced on the server.
- Business rules live in backend domain/application services, not React components.
- Multi-step financial posting occurs inside PostgreSQL transactions.
- Monetary calculations use integer centavos or exact PostgreSQL `NUMERIC` values, never floating-point arithmetic for authoritative results.
- Every schema change uses a migration.
- Posted financial records are never silently edited or deleted.
- Corrections use reversals, adjustments, controlled voiding, or replacement workflows.

### 2.3 Mandatory business areas

- Users, roles, permissions.
- Subscribers.
- Multiple addresses and service accounts per subscriber.
- Internet, Cable, and Combo plans.
- Monthly billing.
- Invoice states.
- Subscriber ledger.
- Cash, GCash, bank transfer, cheque and other payments.
- Oldest-unpaid-first allocation by default.
- Partial and advance payments.
- GCash proof verification.
- Collector areas/routes.
- Collection batches.
- Cash remittance and shortage/overage reconciliation.
- Accounts receivable.
- Aging buckets.
- Service suspension.
- Reconnection.
- Receipts.
- Audit trail.
- PDF/XLSX reports.
- Backup and restore.

---

## 3. ARCHITECTURE DECISION: TWO SEPARATE REPOSITORIES UNDER ONE CENTRALIZED ROOT

This project uses **two independent Git repositories** for strict frontend/backend separation, but both repositories are placed inside one centralized parent directory so the developer and AI agents can work from one workspace.

### 3.1 Centralized workspace root

The root directory is an **orchestration workspace, not the application monorepo**.

```text
BCIS-Subscription-Billing-System/
├── PRODUCT.md
├── SKILLS.md
├── package.json                 # root orchestration only; no application dependencies
├── scripts/                    # cross-repository automation only
│   ├── dev.*
│   ├── test.*
│   ├── build.*
│   ├── lint.*
│   └── release.*
│
├── backend/                    # SEPARATE GIT REPOSITORY
│   ├── .git/
│   ├── package.json
│   ├── pnpm-lock.yaml
│   └── ...
│
└── frontend/                   # SEPARATE GIT REPOSITORY
    ├── .git/
    ├── package.json
    ├── pnpm-lock.yaml
    └── ...
```

**Important:** `backend/` and `frontend/` are separate repositories with independent Git histories, pull requests, branches, tags, and release lifecycles.

The root does **not** become a monorepo merely because the repositories are located under one directory. Do not initialize Git at the root for application source control.

### 3.2 Repository A — Desktop Frontend

**Directory / repository name:** `frontend`

Responsibilities:

- Tauri application shell and Rust command layer.
- Tauri capabilities/permissions.
- React frontend running inside the system WebView.
- Desktop routing/navigation.
- UI components.
- Form state.
- Client-side input hints and validation.
- API client.
- Query/cache state.
- Print previews and print layouts.
- UX permissions visibility.
- Desktop packaging/installer.
- Local session state.

The frontend is **not authoritative** for:

- billing calculations
- payment allocation
- balances
- permissions
- receipt numbering
- invoice numbering
- financial state transitions
- audit records

### 3.3 Repository B — Backend/API

**Directory / repository name:** `backend`

Responsibilities:

- Fastify application.
- Authentication.
- Authorization/RBAC.
- Zod validation.
- Domain/application services.
- Billing engine.
- Ledger engine.
- Payment posting/allocation.
- GCash verification.
- Collector batches/remittance.
- AR aging.
- Suspension/reconnection rules.
- Audit events.
- Reporting data services.
- PostgreSQL/Drizzle migrations.
- Backup/restore utilities.
- Structured logging.
- API health/readiness.
- OpenAPI contract.

The backend is the **single authority** for business truth.

### 3.4 Centralized pnpm orchestration — commands run from the root

The root workspace owns the **developer-facing pnpm command surface** so common commands are not duplicated across documentation, agent prompts, or shell workflows.

Use:

```text
BCIS-Subscription-Billing-System/
├── package.json
├── SKILLS.md
├── backend/      # separate Git repo
└── frontend/     # separate Git repo
```

The root `package.json` is **orchestration-only**. It must not contain application source code, backend/frontend runtime dependencies, or shared application packages. It must not be configured as a pnpm workspace. Small root-only developer tooling (for example, a process runner) is allowed when it exists solely to orchestrate both repositories.

**Do not create `pnpm-workspace.yaml`.**

**Do not move backend/frontend dependencies into the root.**

Each child repository keeps its own:

```text
package.json
pnpm-lock.yaml
node_modules/
```

The root invokes child-repository commands using pnpm's `--dir`/`-C` capability. The command is entered at the root, while the actual package operation executes against the selected child repository. For example:

```bash
pnpm --dir backend install
pnpm --dir frontend install

pnpm --dir backend dev
pnpm --dir frontend dev

pnpm --dir backend test
pnpm --dir frontend test
```

The preferred developer experience is to expose short root aliases in the root `package.json`, for example:

```bash
pnpm backend:install
pnpm frontend:install
pnpm install:all

pnpm backend:dev
pnpm frontend:dev
pnpm dev

pnpm backend:test
pnpm frontend:test
pnpm test

pnpm backend:lint
pnpm frontend:lint
pnpm lint

pnpm backend:typecheck
pnpm frontend:typecheck
pnpm typecheck

pnpm backend:build
pnpm frontend:build
pnpm build
```

The root scripts must delegate to the child repository; they must not duplicate child package scripts.

For example:

```json
{
  "scripts": {
    "backend:dev": "pnpm --dir backend dev",
    "frontend:dev": "pnpm --dir frontend dev",
    "backend:test": "pnpm --dir backend test",
    "frontend:test": "pnpm --dir frontend test"
  }
}
```

### 3.5 pnpm operating rules

1. **Run normal developer commands from the centralized root.**
2. Use `pnpm --dir backend ...` for backend operations.
3. Use `pnpm --dir frontend ...` for frontend operations.
4. Do not copy the same orchestration scripts into both repositories.
5. Do not make the root a pnpm workspace.
6. Do not use the root as a shared lockfile/dependency store for backend or frontend applications.
7. Each application repository owns its own dependency lockfile; the root may have a separate lockfile only for root-level orchestration tooling.
8. A root command must delegate to a child repository rather than reimplementing its logic.
9. Agents should prefer root aliases such as `pnpm test` and `pnpm build` for cross-repository operations.
10. Direct child-repository commands remain valid when debugging or maintaining that repository specifically.

### 3.6 Centralized Agent Skills

There must be **one project-level `SKILLS.md` at the centralized root**:

```text
BCIS-Subscription-Billing-System/
└── SKILLS.md
```

Do **not** create:

```text
backend/SKILLS.md
frontend/SKILLS.md
```

The root `SKILLS.md` is the authoritative catalog and operating guide for all AI-agent skills used across both repositories.

At minimum, its catalog must contain these project-approved skills:

| Scope | Skill | Source | Install / Reference | Primary use |
|---|---|---|---|---|
| Global | Caveman | `JuliusBrussee/caveman` | `npx skills add JuliusBrussee/caveman --skill '*' -g` | Concise agent communication, commit/review/compress workflows |
| Frontend | impeccable | `pbakaus/impeccable` | `npx skills add https://github.com/pbakaus/impeccable --skill impeccable` | UI shaping, critique, audit, polish |
| Frontend | ui-ux-pro-max | `nextlevelbuilder/ui-ux-pro-max-skill` | `npx skills add https://github.com/nextlevelbuilder/ui-ux-pro-max-skill --skill ui-ux-pro-max --yes` | UI/UX research, palettes, typography, patterns, accessibility, desktop guidance |
| Frontend | emil-design-eng | `emilkowalski/skills` | `npx skills@latest add emilkowalski/skills` | Design engineering, interaction and motion quality |
| Frontend | design-taste-frontend | `jeettrench/taste-skill` | `npx skills add https://github.com/jeettrench/taste-skill --skill design-taste-frontend` | Premium visual quality and anti-generic frontend design |

The exact repositories and install commands above were checked against their current public project documentation.

It must also document:

- installed skills
- source repositories
- purpose of each skill
- when a skill should be used
- installation/update instructions
- compatibility notes
- frontend-specific use cases
- backend-specific use cases
- database/security/testing use cases
- review and verification expectations

Agents must read the root `SKILLS.md` before starting implementation work in either repository.

Project-wide agent rules should also be centralized where supported:

```text
BCIS-Subscription-Billing-System/
├── PRODUCT.md
├── SKILLS.md
└── AGENTS.md / CLAUDE.md   # only if supported by the active agent
```

Do not create duplicate copies of these project-level skill/rule documents inside `backend/` and `frontend/` unless a particular tool requires a repository-local compatibility shim. If such a shim is unavoidable, it must reference the centralized root instructions rather than duplicate their content.

### 3.7 No shared application source packages

Do not create a shared application package such as:

```text
packages/shared/
packages/types/
packages/ui/
```

The frontend and backend communicate through the **versioned API contract**, not source imports.

Shared concepts should be represented through:

- OpenAPI schemas
- generated frontend API types
- documented business rules
- contract tests

This preserves true repository independence while keeping both sides synchronized.

## 4. FRONTEND/BACKEND SYNCHRONIZATION STRATEGY

Separate repositories do not mean separate contracts.

### 4.1 API contract ownership

The backend repository owns the canonical API contract:

```text
backend/
└── docs/
    └── openapi.yaml
```

Every API release must publish or expose a versioned OpenAPI specification.

### 4.2 Frontend contract update process

When an API feature is created:

1. Define domain behavior.
2. Write API acceptance tests.
3. Update OpenAPI schema.
4. Implement backend route/service.
5. Run API contract/integration tests.
6. Publish the backend release containing the contract.
7. Frontend updates its pinned contract version.
8. Generate/update the TypeScript API client.
9. Implement UI against generated types.
10. Run cross-repository integration tests.

### 4.3 Versioning rules

Use semantic API versioning:

- `MAJOR`: breaking contract change.
- `MINOR`: backward-compatible endpoint/field addition.
- `PATCH`: bug fix/no contract break.

Do not allow the frontend to silently target `main` from the backend repository.

Use pinned releases/tags in development and demonstration environments.

### 4.4 Contract compatibility gate

A frontend PR cannot be considered complete until:

- OpenAPI contract validation passes.
- API integration tests pass.
- Generated client/types are updated.
- Frontend typecheck passes.
- Relevant desktop E2E flows pass.

---

## 5. RECOMMENDED TECHNOLOGY STACK

### 5.1 Desktop frontend

| Layer | Technology | Purpose |
|---|---|---|
| Desktop shell | Tauri 2.x | Windows desktop runtime and secure native shell |
| Frontend tooling | Vite | React/TypeScript build and development |
| UI | React 19.2 | Component architecture |
| Language | TypeScript strict | Type safety |
| Styling | Tailwind CSS 4 | Design tokens/utilities |
| UI primitives | shadcn/ui | Accessible, composable components |
| Data tables | TanStack Table | Dense operational tables |
| Server state | TanStack Query | Caching, synchronization, mutations |
| Forms | React Hook Form | Fast structured forms |
| Validation | Zod | Shared schema validation where useful |
| API types | OpenAPI-generated TypeScript client | FE/BE contract synchronization |
| Charts | Recharts or lightweight SVG charts | Operational analytics |
| Reports/preview | pdfmake-compatible preview flow or server-generated documents | Reporting |
| Tests | Vitest + React Testing Library + WebdriverIO/Tauri WebDriver tooling | Unit/component/E2E |
| Packaging | Tauri CLI + WiX/NSIS | Windows MSI / setup installer |

### 5.1.1 Tauri-specific desktop requirements

The desktop repository must target **Tauri 2.x** and pin a tested compatible version set at project initialization. Do not depend on floating major versions in release builds.

Required native toolchain:

- Rust stable toolchain compatible with the pinned Tauri release.
- Tauri CLI matching the project version.
- Windows development/build dependencies required by Tauri.
- WebView2 on Windows using the OS/runtime installation strategy selected for deployment.

The project must keep the Rust layer intentionally small because the application is API-centric. Tauri is the native desktop shell; Fastify is the application server.

Windows packaging should use the Tauri CLI. Tauri supports Windows `.msi` installers via WiX and setup executables via NSIS.

### 5.2 Backend

| Layer | Technology | Purpose |
|---|---|---|
| Runtime | Node.js LTS | Server runtime |
| Framework | Fastify 5 | High-performance typed API |
| Language | TypeScript strict | Maintainability/type safety |
| Validation | Zod 4 | Request/response/domain input validation |
| ORM/schema | Drizzle ORM | Typed PostgreSQL access and migrations |
| Database | PostgreSQL | Central transactional database |
| Logging | Pino | Structured logs |
| API documentation | OpenAPI | Canonical frontend/backend contract |
| Tests | Vitest + Fastify integration tests | Unit/integration |
| E2E | Playwright + API/desktop flows | System verification |
| Reports | ExcelJS + pdfmake or server-side PDF renderer | XLSX/PDF |
| Password hashing | Argon2id preferred | Secure password storage |
| File storage | Server-managed filesystem outside DB | Proof/document storage |
| Backup | PostgreSQL `pg_dump`/restore workflow | Recovery |

### 5.3 Engineering utilities

- Git.
- GitHub.
- Prettier.
- ESLint.
- TypeScript strict mode.
- Husky/lint-staged only if it improves workflow; avoid unnecessary tooling.
- Docker Compose for local PostgreSQL only if useful.
- `.env.example`; no secrets in Git.

---

## 6. REPOSITORY STRUCTURE

### 6.0 Canonical centralized workspace layout

The complete local development workspace is:

```text
BCIS-Subscription-Billing-System/
├── PRODUCT.md
├── SKILLS.md
├── AGENTS.md / CLAUDE.md       # optional agent-specific root instructions
├── package.json                # root orchestration only
├── pnpm-lock.yaml              # root tooling only, if root tooling uses dependencies
├── scripts/                    # cross-repository automation
├── backend/                    # independent Git repository
│   ├── .git/
│   ├── package.json
│   └── pnpm-lock.yaml
└── frontend/                   # independent Git repository
    ├── .git/
    ├── package.json
    └── pnpm-lock.yaml
```

The root is the developer/agent control plane. `backend/` and `frontend/` remain independent application repositories.

### 6.1 Backend repository

```text
backend/
├── src/
│   ├── app/
│   │   ├── server.ts
│   │   ├── plugins/
│   │   ├── config/
│   │   ├── errors/
│   │   └── middleware/
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── subscribers/
│   │   ├── services/
│   │   ├── billing/
│   │   ├── ledger/
│   │   ├── payments/
│   │   ├── gcash/
│   │   ├── collections/
│   │   ├── receivables/
│   │   ├── service-control/
│   │   ├── reports/
│   │   ├── documents/
│   │   ├── audit/
│   │   └── administration/
│   ├── db/
│   │   ├── schema/
│   │   ├── migrations/
│   │   ├── seeds/
│   │   └── db.ts
│   ├── shared/
│   │   ├── money/
│   │   ├── pagination/
│   │   ├── dates/
│   │   └── identifiers/
│   └── tests/
├── docs/
│   ├── openapi.yaml
│   ├── architecture.md
│   ├── financial-rules.md
│   └── deployment.md
├── scripts/
│   ├── backup.ts
│   ├── restore.ts
│   ├── seed.ts
│   └── verify-backup.ts
├── .env.example
├── drizzle.config.ts
├── package.json
└── README.md
```

### 6.2 Frontend repository

```text
frontend/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   └── lib.rs
│   ├── capabilities/
│   │   ├── default.json
│   │   └── desktop.json
│   ├── icons/
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/
│   ├── app/
│   │   ├── router/
│   │   ├── providers/
│   │   └── shell/
│   ├── api/
│   │   ├── generated/
│   │   ├── client.ts
│   │   └── queryKeys.ts
│   ├── features/
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── subscribers/
│   │   ├── services/
│   │   ├── billing/
│   │   ├── payments/
│   │   ├── gcash/
│   │   ├── collections/
│   │   ├── receivables/
│   │   ├── service-control/
│   │   ├── reports/
│   │   └── administration/
│   ├── components/
│   │   ├── ui/
│   │   ├── data-table/
│   │   ├── forms/
│   │   ├── status/
│   │   └── money/
│   ├── hooks/
│   ├── lib/
│   ├── styles/
│   └── tests/
├── e2e/
├── .env.example
├── package.json
└── README.md
```

---

## 7. DOMAIN ARCHITECTURE

Use a modular monolith backend rather than microservices.

The system is too small for microservice operational complexity. The correct production-oriented academic architecture is a well-separated modular monolith with explicit domain boundaries.

### 7.1 Backend layers

```text
Route / Controller
      ↓
Request validation
      ↓
Application service / use case
      ↓
Domain service / policy
      ↓
Repository / DB transaction
      ↓
PostgreSQL
```

Rules:

- Routes handle HTTP concerns.
- Application services orchestrate a business use case.
- Domain services contain business invariants.
- Repositories provide database access.
- Database constraints protect critical invariants at the final boundary.
- Financial operations explicitly open a database transaction.

### 7.2 Core domains

1. Identity & Access
2. Subscribers
3. Services & Plans
4. Billing
5. Ledger
6. Payments
7. GCash Verification
8. Collections
9. Receivables
10. Service Control
11. Reports
12. Audit & Administration
13. Backup/Recovery

---

# 8. DATABASE DESIGN — PRODUCTION-ORIENTED PostgreSQL SCHEMA

The database should be normalized around operational entities while using carefully selected denormalized/cache fields only where they provide measurable query benefits.

### 8.1 Core design principles

- Use UUID primary keys for internal entity identity where practical.
- Use human-readable unique business identifiers for accounts, invoices and receipts.
- Use `NUMERIC(14,2)` for authoritative money values OR integer centavos consistently. Preferred approach: `NUMERIC(14,2)` for database readability, with backend money value objects preventing floating-point arithmetic.
- Store timestamps in UTC (`timestamptz`); display in Asia/Manila.
- Store dates such as billing due dates as date types when time-of-day is not semantically required.
- Use PostgreSQL enums or constrained text values for stable finite states.
- Use foreign keys for every owned relationship.
- Add indexes based on actual query paths, not every column.
- Prefer immutable financial records.
- Use soft lifecycle/status fields for business entities instead of destructive deletes.

---

## 8.2 Identity and authorization tables

### `users`

Purpose: login identity.

Key columns:

- `id` UUID PK
- `username` CITEXT UNIQUE NOT NULL
- `password_hash` TEXT NOT NULL
- `display_name` TEXT NOT NULL
- `email` TEXT NULL
- `is_active` BOOLEAN NOT NULL DEFAULT TRUE
- `last_login_at` TIMESTAMPTZ NULL
- `failed_login_count` INTEGER NOT NULL DEFAULT 0
- `locked_until` TIMESTAMPTZ NULL
- `created_at`
- `updated_at`

Indexes:

- unique lower/case-insensitive username
- active-user lookup

### `roles`

- `id`
- `code` UNIQUE
- `name`
- `description`
- `is_system_role`

### `permissions`

Examples:

- `subscriber.view`
- `subscriber.create`
- `subscriber.update`
- `billing.generate`
- `billing.view`
- `payment.create`
- `payment.reverse`
- `gcash.verify`
- `collection.reconcile`
- `report.export`
- `user.manage`
- `backup.restore`

### `user_roles`

Composite PK:

```text
(user_id, role_id)
```

### `role_permissions`

Composite PK:

```text
(role_id, permission_id)
```

### `sessions`

Store server-side session/token metadata if the chosen auth model requires it.

Recommended fields:

- `id`
- `user_id`
- `session_token_hash`
- `issued_at`
- `expires_at`
- `revoked_at`
- `ip_address`
- `user_agent`

Never store raw long-lived secrets in logs.

---

# 8.3 Subscriber and service model

### `subscribers`

Purpose: one customer identity may own multiple service accounts.

Columns:

- `id` UUID PK
- `account_number` VARCHAR(32) UNIQUE NOT NULL
- `first_name`
- `middle_name`
- `last_name`
- `business_name` NULL
- `primary_contact_number`
- `secondary_contact_number` NULL
- `email` NULL
- `status` (`ACTIVE`, `INACTIVE`, `TERMINATED`, `ARCHIVED`)
- `notes` NULL
- `created_at`
- `updated_at`
- `archived_at` NULL

Search strategy:

- exact index on `account_number`
- normalized contact number index
- optional PostgreSQL trigram index for name/address search after profiling

### `subscriber_addresses`

One subscriber can have multiple addresses.

Columns:

- `id`
- `subscriber_id`
- `label` (Home, Office, etc.)
- `line1`
- `line2`
- `barangay`
- `city_municipality`
- `province`
- `postal_code`
- `landmark`
- `is_primary`
- `created_at`
- `updated_at`

Index:

- `(subscriber_id, is_primary)`

### `service_types`

Seed values:

- `INTERNET`
- `CABLE`
- `COMBO`

### `service_plans`

Columns:

- `id`
- `service_type_id`
- `code` UNIQUE
- `name`
- `description`
- `monthly_price` NUMERIC(14,2)
- `installation_fee` NUMERIC(14,2) DEFAULT 0
- `reconnection_fee` NUMERIC(14,2) DEFAULT 0
- `speed_mbps` NULL for non-internet
- `channel_count` NULL for non-cable
- `is_active`
- `created_at`
- `updated_at`

Important: plan price is the current catalog value only. Historical invoices preserve their own line-item price snapshot.

### `service_accounts`

Represents a billable service/subscription under a subscriber.

Columns:

- `id` UUID PK
- `subscriber_id` FK
- `service_account_number` UNIQUE
- `service_type_id` FK
- `service_plan_id` FK
- `installation_address_id` FK
- `activation_date`
- `billing_start_date`
- `billing_day` SMALLINT
- `due_day` SMALLINT
- `current_rate` NUMERIC(14,2)
- `status` (`PENDING`, `ACTIVE`, `SUSPENDED`, `DISCONNECTED`, `TERMINATED`)
- `collector_id` FK NULL
- `collection_area_id` FK NULL
- `cached_balance_due` NUMERIC(14,2) DEFAULT 0
- `last_billed_at` TIMESTAMPTZ NULL
- `created_at`
- `updated_at`

`cached_balance_due` is an optimization/cache, not the ultimate financial source of truth. A reconciliation routine must be able to rebuild it from invoice/payment allocations.

### `service_account_status_history`

Immutable status history:

- `id`
- `service_account_id`
- `from_status`
- `to_status`
- `effective_at`
- `reason`
- `actor_user_id`
- `notes`
- `created_at`

### Optional `service_devices`

Use only if the actual business process requires device/equipment records.

---

# 8.4 Billing tables

### `billing_cycles`

Represents an accounting/billing period.

Columns:

- `id`
- `cycle_code` UNIQUE (`2026-09`)
- `period_start`
- `period_end`
- `billing_date`
- `due_date`
- `status` (`OPEN`, `GENERATING`, `GENERATED`, `LOCKED`, `CLOSED`)
- `created_at`
- `closed_at`

Unique constraint on `cycle_code`.

### `invoices`

Columns:

- `id`
- `invoice_number` UNIQUE
- `service_account_id`
- `billing_cycle_id`
- `invoice_date`
- `due_date`
- `status` (`DRAFT`, `UNPAID`, `PARTIALLY_PAID`, `PAID`, `OVERDUE`, `VOID`, `CREDITED`)
- `subtotal`
- `discount_total`
- `penalty_total`
- `adjustment_total`
- `total_amount`
- `amount_paid_cache`
- `balance_due_cache`
- `finalized_at`
- `voided_at` NULL
- `void_reason` NULL
- `created_by`
- `created_at`
- `updated_at`

**Critical unique rule:** prevent more than one canonical invoice for a service account and billing cycle.

Recommended constraint:

```text
UNIQUE(service_account_id, billing_cycle_id)
```

A voided invoice remains the historical invoice for that period. Corrections should use controlled adjustment/replacement logic rather than silently generating duplicates.

### `invoice_items`

Columns:

- `id`
- `invoice_id`
- `line_type` (`SUBSCRIPTION`, `INSTALLATION`, `RECONNECTION`, `PENALTY`, `DISCOUNT`, `ADJUSTMENT`, `OTHER`)
- `description`
- `quantity`
- `unit_price`
- `line_total`
- `source_reference` NULL
- `created_at`

Historical price snapshot lives here.

### `invoice_adjustments`

For approved corrections without destructive editing.

- `id`
- `invoice_id`
- `adjustment_type` (`DEBIT`, `CREDIT`)
- `amount`
- `reason`
- `status` (`DRAFT`, `APPROVED`, `VOIDED`)
- `requested_by`
- `approved_by` NULL
- `approved_at` NULL
- `created_at`

### Invoice lifecycle rules

- Draft can be edited.
- Finalized invoice amounts are immutable.
- Status changes are controlled by domain rules.
- Void requires permission and reason.
- Any correction leaves an audit trail.

---

# 8.5 Subscriber ledger design

The ledger must be reproducible and auditable.

### `ledger_entries`

Purpose: immutable financial movement at service-account level.

Columns:

- `id` UUID PK
- `service_account_id`
- `entry_no` BIGINT or generated sequence per service account
- `posted_at`
- `entry_date`
- `reference_type` (`INVOICE`, `PAYMENT`, `ADJUSTMENT`, `REVERSAL`, `CREDIT`)
- `reference_id`
- `description`
- `debit_amount` NUMERIC(14,2) DEFAULT 0
- `credit_amount` NUMERIC(14,2) DEFAULT 0
- `currency` CHAR(3) DEFAULT `PHP`
- `created_by`
- `created_at`

Constraints:

```text
debit_amount >= 0
credit_amount >= 0
NOT (debit_amount > 0 AND credit_amount > 0)
(debit_amount + credit_amount) > 0
```

Do not store a manually editable running balance in each ledger row.

Instead, calculate the running balance as:

```text
running_balance = SUM(debit_amount - credit_amount)
                  OVER (PARTITION BY service_account_id
                        ORDER BY posted_at, id)
```

For performance, allow a cached account balance on `service_accounts` and a reconciliation job, but preserve the ledger as the authoritative history.

### Ledger invariants

- Invoice posting creates a debit.
- Payment posting creates a credit.
- Payment reversal creates a compensating debit/credit pair according to the transaction model.
- Posted ledger entries are immutable.
- Every ledger entry references an auditable source transaction.
- A transaction cannot partially post.

---

# 8.6 Payment model

### `payments`

Columns:

- `id`
- `payment_number` UNIQUE
- `receipt_number` UNIQUE
- `payment_date`
- `amount`
- `payment_method` (`CASH`, `GCASH`, `BANK_TRANSFER`, `CHEQUE`, `OTHER`)
- `reference_number` NULL
- `status` (`PENDING`, `VERIFIED`, `POSTED`, `REVERSED`, `VOID`)
- `received_by`
- `notes`
- `created_at`
- `posted_at` NULL

Do not use a database constraint that makes GCash references globally unique across all payment methods unless policy explicitly requires it. Instead, enforce a controlled rule such as uniqueness among active/posted GCash transactions.

### `payment_allocations`

A bridge between one payment and one or more invoices.

Columns:

- `id`
- `payment_id`
- `invoice_id`
- `allocated_amount`
- `allocation_sequence`
- `allocation_type` (`AUTO_OLDEST_FIRST`, `MANUAL`, `ADVANCE_CREDIT`)
- `created_at`

Constraints:

```text
allocated_amount > 0
SUM(allocations for a payment) <= payment.amount
SUM(allocations for an invoice) <= invoice.total_amount
```

Default allocation policy:

> Oldest unpaid invoice first.

### Advance payment handling

When payment exceeds current outstanding invoices:

- never discard the excess.
- record it as unapplied/advance credit according to policy.
- make the value visible on the subscriber/service-account account.
- future billing consumes the credit according to the documented allocation policy.

A clean implementation can use:

```text
payment_allocations
+ service_account_credit_balance / credit transaction records
```

rather than inventing a negative invoice balance.

### `payment_reversals`

Columns:

- `id`
- `payment_id`
- `reversal_number` UNIQUE
- `reversal_date`
- `reason`
- `amount`
- `created_by`
- `approved_by`
- `created_at`

Original payment remains visible.

### `payment_proofs`

Used for GCash and optionally other non-cash payments.

- `id`
- `payment_id`
- `storage_key`
- `original_filename`
- `mime_type`
- `file_size`
- `sha256`
- `verification_status` (`PENDING`, `VERIFIED`, `REJECTED`)
- `submitted_at`
- `verified_by`
- `verified_at`
- `rejection_reason`

Never treat an uploaded screenshot as automatic proof of payment. Verification is a business action.

---

# 8.7 Receipt numbering

Use PostgreSQL-backed server-side numbering.

Recommended approach:

- PostgreSQL sequence for receipt numbers OR a locked `document_sequences` row.
- Number allocation only from the backend.
- Never generate authoritative receipt numbers in the Tauri client.
- Voided receipts retain their number permanently.
- Numbers are never recycled.

### Optional `document_sequences`

```text
id
sequence_type
prefix
next_value
updated_at
```

Use row-level locking (`FOR UPDATE`) where a mutable counter is used. A native PostgreSQL sequence is preferred when number formatting rules allow it.

---

# 8.8 Collector and collection tables

### `collection_areas`

- `id`
- `code` UNIQUE
- `name`
- `description`
- `is_active`

### `collectors`

- `id`
- `user_id`
- `collector_code` UNIQUE
- `name`
- `contact_number`
- `is_active`

### `collector_assignments`

Historical assignment table:

- `id`
- `collector_id`
- `service_account_id`
- `effective_from`
- `effective_to` NULL
- `created_by`

Do not overwrite historical assignments.

### `collection_batches`

States:

```text
OPEN
IN_PROGRESS
SUBMITTED
REMITTED
RECONCILED
CLOSED
```

Columns:

- `id`
- `batch_number` UNIQUE
- `collector_id`
- `collection_area_id`
- `collection_date`
- `status`
- `expected_cash`
- `expected_non_cash`
- `expected_total`
- `remitted_cash`
- `difference`
- `opened_by`
- `submitted_at`
- `reconciled_at`
- `closed_at`

### `collection_batch_accounts`

- `id`
- `collection_batch_id`
- `service_account_id`
- `invoice_id` NULL
- `expected_amount`
- `collected_amount`
- `payment_id` NULL
- `status` (`UNPAID`, `COLLECTED`, `PARTIAL`, `NOT_COLLECTED`)
- `notes`

### `collector_remittances`

- `id`
- `collection_batch_id`
- `remittance_number` UNIQUE
- `remitted_cash`
- `remitted_gcash`
- `remitted_bank_transfer`
- `other_non_cash`
- `shortage_amount`
- `overage_amount`
- `received_by`
- `received_at`
- `notes`

Closing rules:

- balanced batch: difference = 0.
- shortage/overage is explicitly recorded.
- a materially unbalanced batch cannot be silently marked as balanced.
- close requires the configured approval permission.

---

# 8.9 Accounts receivable and aging

Do not create a second source of financial truth for AR.

AR should be derived from finalized invoice balances, with optional cached aggregates for dashboards.

Aging buckets:

- Current
- 1–30 days
- 31–60 days
- 61–90 days
- 90+ days

Base query concept:

```text
invoice.balance_due > 0
AND invoice.status IN (...)
```

Age using the due date relative to the report/as-of date, not the current timestamp blindly.

For performance:

- index invoice due date + status.
- index `(service_account_id, status, due_date)`.
- paginate overdue lists.
- compute summary aggregates on the server.
- never load all invoices into React just to calculate aging.

---

# 8.10 Service control tables

### `suspension_records`

- `id`
- `service_account_id`
- `reason`
- `effective_date`
- `approved_by`
- `notes`
- `created_at`
- `completed_at` NULL

### `reconnection_records`

- `id`
- `service_account_id`
- `request_date`
- `fee`
- `technician_user_id` NULL
- `scheduled_at` NULL
- `completed_at` NULL
- `approved_by`
- `notes`
- `status`

All service state transitions must be represented in status history.

---

# 8.11 Audit and system tables

### `audit_logs`

Immutable audit record for sensitive or financially relevant actions.

Columns:

- `id`
- `occurred_at`
- `actor_user_id`
- `action`
- `entity_type`
- `entity_id`
- `request_id`
- `reason` NULL
- `old_values` JSONB NULL
- `new_values` JSONB NULL
- `ip_address`
- `metadata` JSONB NULL

Never include:

- passwords
- authentication tokens
- confidential secrets
- unnecessary sensitive payment credentials

Do not expose audit log editing from normal screens.

### `application_settings`

For configurable business settings:

- grace period
- suspension threshold
- penalty settings
- receipt prefix
- invoice prefix
- report defaults
- company identity/print settings

Sensitive settings must not be stored in plain text.

### `backup_history`

- `id`
- `backup_type`
- `file_name`
- `started_at`
- `completed_at`
- `status`
- `file_size`
- `checksum`
- `verified_at`
- `performed_by`
- `notes`

---

# 9. DATABASE INDEXING PLAN

Do not blindly index everything. Index the actual high-value query paths.

### Subscribers

- unique `account_number`
- normalized contact number
- `(last_name, first_name)` or a carefully selected search index
- trigram/GIST or GIN only after search profiling for free-text name/address search

### Service accounts

- unique `service_account_number`
- `(subscriber_id, status)`
- `(collector_id, status)`
- `(collection_area_id, status)`
- `(service_plan_id, status)`

### Invoices

- unique `invoice_number`
- `(service_account_id, billing_cycle_id)` unique
- `(status, due_date)`
- `(service_account_id, status, due_date)`
- `(billing_cycle_id, status)`

### Payments

- unique `payment_number`
- unique `receipt_number`
- `(payment_date DESC)`
- `(payment_method, payment_date DESC)`
- `(reference_number)` where applicable
- GCash active/posted reference detection index

### Payment allocations

- `(invoice_id)`
- `(payment_id)`
- `(service_account via invoice)` through invoice index path

### Ledger

- `(service_account_id, posted_at, id)`
- `(reference_type, reference_id)` where reconciliation queries need it

### Collections

- `(collector_id, collection_date DESC)`
- `(collection_area_id, collection_date DESC)`
- unique batch number

### Audit

- `(occurred_at DESC)`
- `(actor_user_id, occurred_at DESC)`
- `(entity_type, entity_id, occurred_at DESC)`

---

# 10. FINANCIAL CONSISTENCY MODEL

Financial correctness is the most important technical concern in the application.

### 10.1 Exact payment

Example:

```text
Invoice: ₱999.00
Payment: ₱999.00

Invoice balance = ₱0.00
Invoice status  = PAID
Ledger balance  = ₱0.00
Receipt         = created
```

### 10.2 Partial payment

```text
Invoice: ₱999.00
Payment: ₱500.00

Allocated: ₱500.00
Remaining: ₱499.00
Status: PARTIALLY_PAID
```

### 10.3 Oldest-first allocation

```text
August:    ₱999
September: ₱999
Payment: ₱1,200

August allocated:    ₱999
September allocated: ₱201
September remaining: ₱798
```

### 10.4 Advance payment

```text
Monthly charge: ₱1,000
Payment: ₱3,000

Current invoice(s): allocated first
Remaining credit: preserved as customer/service credit
```

### 10.5 Payment posting transaction

The payment use case should conceptually perform one database transaction:

```text
BEGIN
  lock target payment/account rows as needed
  validate actor permission
  validate payment status
  validate amount
  detect duplicate payment/reference
  allocate payment
  update invoice statuses
  post ledger credit
  update cached balances
  create receipt data
  create audit log
COMMIT
```

If any step fails, all financial changes roll back.

---

# 11. API DESIGN

Use REST semantics with consistent response/error formats.

### 11.1 Common API rules

- `/api/v1/...` version prefix.
- Cursor or page-based pagination for high-volume lists; use page/size initially for simplicity and cursor pagination where needed.
- Maximum page size enforced server-side.
- Sorting must be allow-listed.
- Filtering must be validated.
- No arbitrary SQL exposed to clients.
- No trust in client-provided role/permission values.
- Use idempotency controls for payment/billing operations where retries could duplicate a financial action.

### 11.2 Suggested endpoint groups

```text
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
GET    /api/v1/auth/me

GET    /api/v1/subscribers
POST   /api/v1/subscribers
GET    /api/v1/subscribers/:id
PATCH  /api/v1/subscribers/:id

GET    /api/v1/service-plans
POST   /api/v1/service-plans
PATCH  /api/v1/service-plans/:id

GET    /api/v1/service-accounts
POST   /api/v1/service-accounts
GET    /api/v1/service-accounts/:id

GET    /api/v1/billing/cycles
POST   /api/v1/billing/cycles
POST   /api/v1/billing/generate
GET    /api/v1/invoices
GET    /api/v1/invoices/:id

POST   /api/v1/payments/preview-allocation
POST   /api/v1/payments
GET    /api/v1/payments
GET    /api/v1/payments/:id
POST   /api/v1/payments/:id/reverse

GET    /api/v1/gcash/verification-queue
POST   /api/v1/gcash/:id/verify
POST   /api/v1/gcash/:id/reject

GET    /api/v1/collections/batches
POST   /api/v1/collections/batches
POST   /api/v1/collections/batches/:id/submit
POST   /api/v1/collections/batches/:id/remit
POST   /api/v1/collections/batches/:id/reconcile
POST   /api/v1/collections/batches/:id/close

GET    /api/v1/receivables/outstanding
GET    /api/v1/receivables/overdue
GET    /api/v1/receivables/aging

POST   /api/v1/service-accounts/:id/suspend
POST   /api/v1/service-accounts/:id/reconnect

GET    /api/v1/reports/... 
GET    /api/v1/subscribers/:id/ledger
GET    /api/v1/subscribers/:id/statement

GET    /api/v1/audit-logs
GET    /api/v1/settings
PATCH  /api/v1/settings

GET    /health
GET    /ready
```

### 11.3 Idempotency

Financial POST endpoints must be designed to survive retries.

Recommended pattern:

- client sends an `Idempotency-Key` for payment/billing commands.
- server stores request fingerprint/result for the protected operation.
- repeated request with same key returns the original result instead of posting again.

Use database uniqueness constraints as the last defense.

---

# 12. UI/UX DESIGN SYSTEM

The laboratory specification already establishes a professional commercial-ISP look: clean, trustworthy, information-dense, consistent, without excessive gradients or decorative effects.

## 12.1 Recommended design direction

**Design concept:** `Operational Trust`

Visual character:

- professional
- calm
- precise
- slightly premium
- finance-aware
- data-dense but not cramped
- low visual noise
- strong hierarchy

Avoid:

- giant hero dashboards
- excessive rounded cards
- glassmorphism everywhere
- gradients used as decoration
- huge KPI numbers
- unnecessary animation
- excessive shadows
- color-only status indicators

## 12.2 Color palette

Use the specification's palette as the base:

| Token | Hex | Use |
|---|---|---|
| Primary Navy | `#0F2747` | navigation, major headings, primary identity |
| Accent Blue | `#2563EB` | primary actions, links, focus |
| Canvas | `#F6F8FB` | application background |
| Surface | `#FFFFFF` | cards, tables, forms |
| Text Primary | `#0F172A` | main text |
| Text Secondary | `#64748B` | supporting text |
| Success | `#059669` | paid, verified, reconciled |
| Warning | `#D97706` | due soon, pending, shortage warning |
| Danger | `#DC2626` | overdue, rejected, blocked, destructive action |
| Border | `#E2E8F0` | separators |
| Muted Surface | `#F1F5F9` | disabled/secondary zones |

### Color rules

- Blue is for action, not decoration.
- Green means a successful/verified state.
- Amber means attention is needed.
- Red is reserved for danger/error/overdue/destructive actions.
- Never communicate a business state through color alone.
- Always pair status colors with a label, icon or text.

## 12.3 Typography

### Primary recommendation: **Inter**

Use Inter as the application system font.

Why:

- excellent screen readability
- strong numeric glyph clarity
- works well in dense tables and forms
- extensive weight range
- professional and neutral
- aligns directly with the laboratory specification's typography recommendation

Recommended weights:

- 400 — body text
- 500 — labels/table emphasis
- 600 — headings/buttons
- 700 — major page headings only

### Financial numbers

Enable tabular numerals for money and quantitative tables.

Example:

```css
font-variant-numeric: tabular-nums;
```

Money must be right-aligned in tables.

### Optional display font

Do not introduce a second decorative font unless the design system proves a real benefit. One strong operational typeface is safer and more consistent.

---

# 13. DESKTOP APP LAYOUT

### Global shell

```text
┌───────────────────────────────────────────────────────────────┐
│ Top bar: page title | context | search | notifications | user│
├───────────────┬───────────────────────────────────────────────┤
│ Sidebar       │                                               │
│               │              Main content                     │
│ Dashboard     │                                               │
│ Subscribers   │                                               │
│ Billing       │                                               │
│ Payments      │                                               │
│ Collections   │                                               │
│ Receivables   │                                               │
│ Services      │                                               │
│ Reports       │                                               │
│ Administration│                                               │
└───────────────┴───────────────────────────────────────────────┘
```

### Navigation

- Dashboard
- Subscribers
- Billing
- Payments
- Collections
- Receivables
- Services
- Reports
- Administration

Navigation visibility can be permission-aware, but permissions must still be enforced on the backend.

---

# 14. HIGH-VALUE UI SCREENS

## 14.1 Dashboard

Show 4–6 compact operational KPIs:

- current receivable
- overdue receivable
- today's collection
- current billing
- pending GCash verification
- collector reconciliation exceptions

Supporting areas:

- billing vs collection trend
- payment method breakdown
- AR aging
- collector performance
- overdue alerts
- recent payments

## 14.2 Subscriber Profile

Tabs:

```text
Overview
Services
Billing
Payments
Ledger
Collections
Service History
Documents
Audit
```

Header should show:

- subscriber account number
- name
- active/inactive status
- total balance
- overdue amount
- service count

## 14.3 Receive Payment — cashier-first design

Optimize for keyboard/mouse speed:

1. Search subscriber/service account.
2. Show current due.
3. Enter payment amount.
4. Choose payment method.
5. Reference number if applicable.
6. Preview allocation.
7. Confirm/post.
8. Print/preview receipt.

Do not make the cashier navigate through many pages for a routine payment.

## 14.4 GCash Verification

Two-pane workflow:

```text
┌──────────────────────────────┬─────────────────────────────┐
│ Pending proofs queue         │ Proof + transaction details │
│                              │                             │
│ Ref # / Subscriber / Amount  │ proof preview               │
│ submitted time / status     │ amount                       │
│                              │ sender / reference          │
│                              │ duplicate detection result  │
│                              │ Verify / Reject              │
└──────────────────────────────┴─────────────────────────────┘
```

## 14.5 Collector Reconciliation

Display clearly:

```text
Expected Cash        ₱20,000.00
Remitted Cash        ₱19,500.00
Difference             ₱500.00 SHORTAGE

Expected Non-Cash     ₱3,200.00
Accounts Collected          47
Exceptions                    3
```

Never hide shortage/overage.

## 14.6 Operational tables

Every major table should support:

- server-side search
- filters
- sort
- pagination
- page size
- column visibility where useful
- export where allowed
- consistent status badges
- row actions
- loading/empty/error states
- sticky table headers where practical

For large datasets, do not render thousands of rows unnecessarily; use pagination or virtualization.

---

# 15. ACCESSIBILITY AND USABILITY

Minimum standard:

- visible form labels
- clear required indicators
- keyboard navigation
- visible focus states
- descriptive errors
- readable text contrast
- buttons with clear verbs
- no color-only meaning
- confirmation for destructive/financial actions
- predictable modal behavior
- consistent date/currency formatting

Cashier and operations screens should minimize unnecessary clicks.

---

# 16. BACKEND IMPLEMENTATION PHASES

The backend is implemented in incremental vertical slices. Do not finish the entire backend before touching the frontend.

## Phase 0 — Engineering Foundation

### Backend

- create Fastify project
- strict TypeScript
- configuration module
- PostgreSQL connection
- Drizzle configuration
- migration framework
- Zod validation
- error model
- Pino logging
- health/readiness endpoints
- base test setup
- OpenAPI generation
- base request ID/correlation ID

### Frontend

- create Tauri 2 + Vite + React project
- React 19.2 + TypeScript strict
- Tailwind + shadcn/ui
- base shell
- `src-tauri/` Rust application shell
- minimal Tauri commands only where desktop integration is required
- explicit `src-tauri/capabilities/` permissions
- API client foundation
- error boundary
- initial routing
- secure external-link handling
- Windows build/installer configuration

### Integration gate

- desktop client can call `/health` through API client
- no frontend/WebView DB access
- CI build works in both repositories

---

# 17. PHASE 1 — AUTHENTICATION + RBAC

### Backend deliverables

- users
- roles
- permissions
- role assignments
- login
- logout/session handling
- account lock/failed login handling
- server-side permission middleware
- `GET /me`
- audit login/logout events

### Frontend deliverables

- login page
- session bootstrap
- protected routes
- permission-aware navigation
- session-expiration handling
- logout
- account lock/error states

### Acceptance gate

Cashier calling an admin-only API directly must receive an authorization failure. Hiding the button is not sufficient.

---

# 18. PHASE 2 — SUBSCRIBERS, PLANS, SERVICE ACCOUNTS

### Backend

- service types
- plans
- subscribers
- addresses
- service accounts
- status history
- collector/area references
- search endpoints
- validation and uniqueness checks

### Frontend

- subscriber list
- subscriber creation/edit
- subscriber detail/profile
- service account list
- plan management
- address management
- global search UI

### Integration gate

Create subscriber → create service account → assign plan → view profile successfully.

---

# 19. PHASE 3 — BILLING + LEDGER ENGINE

This is the first major financial checkpoint.

### Backend

Implement:

- billing cycles
- billing generation
- duplicate billing protection
- invoice numbering
- invoice item snapshots
- due date rules
- invoice lifecycle
- invoice posting
- ledger debit
- balance calculation
- billing audit logs

### Tests required before/with implementation

- billing one service account
- billing multiple service accounts
- duplicate billing prevention
- plan price change does not rewrite historical invoice
- invoice totals
- due date rules
- ledger debit

### Frontend

- billing cycle list
- generate billing workflow
- generation preview
- invoice list
- invoice detail
- invoice status presentation
- subscriber ledger view

### Integration gate

Generate September billing, verify invoice, line items, ledger debit and resulting balance.

---

# 20. PHASE 4 — PAYMENTS, ALLOCATION, RECEIPTS

Second major financial checkpoint.

### Backend

Implement:

- payment creation
- payment transaction
- oldest-first allocation
- partial allocation
- advance credit
- receipt numbering
- payment reversal
- duplicate reference protection
- ledger credit
- invoice status transition
- payment audit record
- idempotency

### Frontend

- receive payment
- allocation preview
- receipt preview/print
- payment history
- payment detail
- reversal request workflow
- balance refresh

### Required acceptance tests

- exact payment
- partial payment
- advance payment
- oldest-first payment
- duplicate GCash reference
- payment reversal

### Integration gate

The API result, invoice balance, ledger balance, subscriber profile, payment history and receipt must all agree.

---

# 21. PHASE 5 — GCASH VERIFICATION

### Backend

- proof metadata
- safe attachment storage
- file type/size validation
- duplicate reference check
- verification queue
- verify/reject transitions
- audit actor/time
- only verified payments can post into final financial workflow

### Frontend

- queue table
- proof preview
- transaction metadata panel
- verify/reject actions
- duplicate warning
- audit history

### Integration gate

Upload proof → pending → verify → payment posts → ledger updates.

Reject path must preserve evidence/history.

---

# 22. PHASE 6 — COLLECTORS + COLLECTION BATCHES + REMITTANCE

### Backend

- collection areas
- collector assignments
- collection batch lifecycle
- expected amounts
- collected payments
- remittances
- shortage/overage calculations
- reconciliation
- closing controls

### Frontend

- collectors
- areas/routes
- batch list
- route sheet preview
- batch collection screen
- remittance screen
- reconciliation screen
- collector performance

### Integration gate

Demonstrate:

- balanced remittance
- shortage
- overage
- prevention of silent balanced closing

---

# 23. PHASE 7 — RECEIVABLES, AGING, SUSPENSION, RECONNECTION

### Backend

- outstanding invoice queries
- overdue queries
- AR aging
- suspension threshold
- grace period
- suspension record
- reconnection workflow
- service state history

### Frontend

- outstanding list
- overdue list
- aging dashboard/table
- suspension candidate screen
- suspension action
- reconnection request
- technician assignment if applicable

### Integration gate

Show an overdue account progressing through the documented service-control workflow without losing historical state.

---

# 24. PHASE 8 — DASHBOARD + REPORTING + PRINTING

### Backend

Create server-side report queries/services for:

1. Daily collection report
2. Monthly collection report
3. Billing vs collection
4. AR aging
5. Subscriber Statement of Account
6. Collector collection/remittance/performance
7. Payment method summary
8. Subscriber master list
9. Payment reversal/void report
10. Audit activity report

Exports:

- PDF
- XLSX
- CSV where useful

### Frontend

- KPI dashboard
- report filter panel
- report preview
- export actions
- printable subscriber SOA
- printable receipt
- printable route sheet

### Integration gate

Report totals must reconcile against source transactions.

---

# 25. PHASE 9 — SECURITY, HARDENING, BACKUP, DEPLOYMENT

### Backend

- secure environment handling
- password hashing verification
- authorization review
- rate limits/sensible login protection
- safe attachment handling
- structured error logging
- backup scripts
- restore scripts
- backup checksum/verification
- database integrity check
- migration deployment process
- production config validation

### Frontend

- Tauri capability and native-command security review
- CSP as appropriate
- Tauri command/API minimization
- safe external URL policy
- no secret keys in frontend/WebView or Rust source
- no API credentials hard-coded in bundle
- session handling review
- installer configuration

### Deployment

Server PC:

```text
Windows Server/Windows workstation
├── Fastify API service
├── PostgreSQL
├── attachment storage
├── backup storage
└── logs
```

Client PCs:

```text
PC1 → Tauri Windows installer
PC2 → Tauri Windows installer
PC3 → Tauri Windows installer
```

Use a fixed/private LAN IP or local DNS name for the API server. Clients point to the configured API base URL.

### Integration gate

Install on all three PCs and perform simultaneous read/write tests.

---

# 26. PHASE 10 — QA, DOCUMENTATION, DEFENSE

### Required artifacts

Backend:

- API documentation
- architecture document
- financial rules document
- database ERD
- data dictionary
- deployment guide
- backup/restore guide

Frontend:

- UI screenshots
- user manual
- installer/release notes

Testing:

- automated test output
- acceptance test report
- bug log
- regression evidence

Defense:

- architecture explanation
- major module walkthrough
- database relationship explanation
- financial workflow explanation
- security explanation
- AI-assisted development explanation

---

# 27. SYNCHRONIZED FRONTEND/BACKEND FEATURE MATRIX

Every feature must be delivered as a vertical slice.

| Feature | Backend source of truth | Frontend surface | Verification |
|---|---|---|---|
| Login | Auth service | Login screen | API + E2E |
| Subscriber | Subscriber module | List/profile/form | API + component + E2E |
| Plan | Service plan module | Plan screens | API + E2E |
| Service account | Service module | Service tab | API + E2E |
| Billing | Billing engine | Generate billing + invoices | Unit + integration + E2E |
| Ledger | Ledger module | Ledger/statement | Financial integration |
| Payment | Payment module | Receive payment | Financial integration |
| Allocation | Allocation service | Allocation preview | Unit + integration |
| GCash | Verification module | Verification queue | API + E2E |
| Collections | Collection module | Batch/reconciliation UI | Integration + E2E |
| AR | Receivables module | Aging/overdue | Query tests + E2E |
| Suspension | Service control | Suspension UI | Domain + E2E |
| Reports | Report services | Report screens | Reconciliation tests |
| Audit | Audit module | Audit view | Integration |
| Backup | Admin/scripts | Backup UI/status where appropriate | Restore test |

---

# 28. TESTING STRATEGY

## 28.1 Backend unit tests

High-priority domains:

- invoice calculations
- invoice state transitions
- due-date calculations
- oldest-first allocation
- partial payment
- advance credit
- reversal calculations
- AR aging
- collector difference calculations
- suspension eligibility
- permission checks

## 28.2 Integration tests

Use a real PostgreSQL test database where practical for financial workflows.

Test:

- transaction rollback
- uniqueness constraints
- foreign keys
- allocation persistence
- concurrent payment attempts
- receipt numbering
- duplicate prevention

## 28.3 Frontend component tests

Cover:

- payment form
- allocation preview
- status badges
- permission visibility
- validation messages
- table filter states
- report filter forms

## 28.4 Desktop E2E tests

Use WebdriverIO with the Tauri testing service / WebDriver support for key desktop workflows:

1. login
2. subscriber creation
3. service account creation
4. billing generation
5. exact payment
6. partial payment
7. GCash verification
8. collector reconciliation
9. overdue review
10. payment reversal
11. report export/preview
12. logout/role restrictions

---

# 29. MANDATORY ACCEPTANCE TESTS

The implementation must pass the following scenarios before final release.

### AT-01 Exact payment

Input:

- invoice = ₱999
- payment = ₱999

Expected:

- remaining = ₱0
- invoice = PAID
- ledger balanced
- receipt created

### AT-02 Partial payment

Input:

- invoice = ₱999
- payment = ₱500

Expected:

- remaining = ₱499
- invoice = PARTIALLY_PAID
- allocation correct
- ledger correct

### AT-03 Advance payment

Input:

- monthly = ₱1,000
- payment = ₱3,000

Expected:

- value is not lost
- allocation/credit follows documented policy

### AT-04 Oldest-first arrears

Input:

- August = ₱999
- September = ₱999
- payment = ₱1,200

Expected:

- August = ₱0
- September = ₱798

### AT-05 Duplicate GCash reference

Expected:

- block or explicitly warn according to documented policy
- never double-post the same verified reference

### AT-06 Payment reversal

Expected:

- original payment remains visible
- linked reversal exists
- balances are restored correctly
- actor/reason are audited

### AT-07 Balanced collector remittance

Input:

- cash collected = ₱20,000
- remitted = ₱20,000

Expected:

- difference = ₱0
- batch may reconcile/close

### AT-08 Collector shortage

Input:

- cash collected = ₱20,000
- remitted = ₱19,500

Expected:

- ₱500 shortage displayed
- cannot silently close as balanced

### AT-09 Concurrent users

Two/three clients perform valid operations.

Expected:

- no data corruption
- no duplicate numbering
- no unauthorized cross-session effect

### AT-10 Authorization

Cashier attempts admin-only operation.

Expected:

- server rejects operation even if directly called

### AT-11 Duplicate billing

Run billing generation twice for the same service account/period.

Expected:

- no duplicate finalized invoice

### AT-12 Backup/restore

1. Create test backup.
2. Change data.
3. Restore approved backup.
4. Verify integrity.

Expected:

- expected historical records return
- database passes integrity checks

---

# 30. PERFORMANCE PLAN

Target dataset:

- 20,000 subscribers
- 500,000 invoices
- 500,000 payments
- 1,000,000 ledger-related entries

### Rules

- Never load all rows into the Tauri WebView/frontend.
- Paginate server-side.
- Use indexes for actual filters/sorts.
- Return only required columns in list endpoints.
- Avoid N+1 queries.
- Use joins or carefully designed batch queries.
- Use aggregates in SQL rather than computing large datasets in React.
- Use `EXPLAIN ANALYZE` on important financial/report queries.
- Add indexes only when query plans justify them.
- Virtualize exceptionally large UI lists.
- Keep report generation server-side.
- Avoid JSON blobs as a substitute for relational columns.

### Performance verification checklist

- subscriber search
- invoice search
- payment history
- overdue list
- AR aging
- dashboard summary
- monthly collection report

Record query plans for the slowest important queries during hardening.

---

# 31. SECURITY MODEL

### Authentication

- secure password hash
- account activation state
- sensible failed-login handling
- session expiration
- logout/revocation

### Authorization

Permission checks must happen in Fastify route/application services.

UI permissions only affect what the user sees.

### Input validation

Validate:

- body
- params
- query strings
- file metadata
- pagination/sorting
- report filters

### Tauri native capability boundary

The Tauri shell is a desktop security boundary, not a second business backend.

Use Tauri 2.x capabilities to grant only the minimum native permissions needed by each window. Capability files live under `src-tauri/capabilities/` and must be explicit about allowed windows and permissions. Do not enable broad filesystem, shell, process, or OS permissions by default.

Use a native Tauri command only when the feature genuinely requires desktop integration, such as:

- opening the system print dialog
- selecting a local export destination
- reading a narrowly-scoped local configuration value
- launching a controlled external URL

Never move billing, payment allocation, ledger posting, authorization decisions, or audit authority into Tauri commands. Those remain in Fastify. Tauri capabilities reduce the frontend's local privilege; they do not replace server-side authorization.

Tauri's capability system provides fine-grained permission boundaries for windows/webviews. Keep capabilities narrow and explicit, with permissions scoped to the specific windows and native operations that require them.

### Attachments

Payment proof files must be:

- type validated
- size limited
- stored outside publicly served static directories
- stored under generated/safe names
- optionally hashed
- access-controlled by the API

### Tauri security

- Use Tauri 2 capability-based permissions.
- Keep capability files explicit and minimal.
- Do not expose unrestricted filesystem, shell, process, or OS permissions.
- No direct PostgreSQL/database access from the WebView.
- Keep native Tauri commands small, typed, validated, and narrowly permitted.
- Do not put billing/payment authority or RBAC authority in Rust desktop commands.
- Avoid loading untrusted remote pages in the application window.
- Keep the frontend on a trusted local asset origin.
- Treat Tauri's capability boundary as defense-in-depth; Fastify remains authoritative for business authorization.

### Secrets

Never commit:

- production DB passwords
- GCash secrets
- API keys
- JWT/session signing secrets
- customer evidence
- real customer datasets

---

# 32. BACKUP AND RECOVERY

Production-ready behavior requires a tested restore path, not merely a backup button.

### Backup contents

- PostgreSQL database
- payment proofs/attachments
- configuration necessary to restore the application state

### Backup metadata

Record:

- start/end time
- result
- file size
- checksum
- operator
- verification status

### Restore test

At least once before final defense:

```text
Fresh test database
       ↓
Restore backup
       ↓
Run integrity checks
       ↓
Count key entities
       ↓
Verify sample subscribers/invoices/payments
       ↓
Verify reports/balances
```

---

# 33. GIT AND RELEASE STRATEGY

## Frontend repository branches

```text
main
  ├── feature/*
  ├── fix/*
  └── release/*
```

## Backend repository branches

Same strategy.

### Commit style

Use meaningful commits:

```text
feat(billing): add duplicate billing protection
feat(payments): implement oldest-first allocation
fix(ledger): correct reversal posting
feat(gcash): add proof verification workflow
test(payments): cover partial and advance allocation
docs(api): update payment endpoints
```

### Releases

Coordinate release tags:

```text
backend: v1.3.0
frontend: v1.3.0
```

A frontend release should declare the backend API version it was built/tested against.

---

# 33.1 ROOT COMMAND CONVENTION

All cross-repository development commands are exposed from the centralized root.

From:

```text
BCIS-Subscription-Billing-System/
```

run commands such as:

```bash
pnpm install:all
pnpm dev
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

The root aliases delegate into `backend/` and `frontend/` using `pnpm --dir ...`.

The root must not install backend or frontend runtime dependencies itself.

Examples:

```bash
pnpm --dir backend install
pnpm --dir frontend install
```

are valid implementation details, but normal documented workflows should prefer the root aliases:

```bash
pnpm backend:install
pnpm frontend:install
```

This reduces command duplication and gives agents one predictable command surface without merging the repositories.

# 33.2 ROOT AGENT SKILLS POLICY

The only authoritative project-level skills catalog is:

```text
BCIS-Subscription-Billing-System/SKILLS.md
```

Agents working on either child repository must load this file from the centralized root before implementation.

Never maintain independent `backend/SKILLS.md` and `frontend/SKILLS.md` files.

# 34. CROSS-REPOSITORY CI/CD

## Backend CI

On pull request:

```text
install
→ lint
→ typecheck
→ unit tests
→ integration tests
→ migration validation
→ OpenAPI validation
→ build
```

## Frontend CI

On pull request:

```text
install
→ lint
→ typecheck
→ component tests
→ API contract validation
→ build
→ Tauri desktop E2E smoke tests (WebdriverIO + Tauri service/WebDriver)
```

Tauri supports WebDriver-based end-to-end testing on Windows; use WebdriverIO with the Tauri testing service/WebDriver integration for desktop workflows.

## Cross-repository compatibility

All cross-repository CI orchestration is launched from the centralized root. The child repositories remain independent Git repositories.

For release builds:

```text
Backend release
      ↓
OpenAPI contract artifact
      ↓
Frontend pins contract version
      ↓
Client generation
      ↓
Desktop integration tests
```

---

# 35. AI-ASSISTED DEVELOPMENT RULES

AI is an engineering accelerator, not the authority.

### The agent must not

- invent business rules
- silently change financial behavior
- remove acceptance tests to make CI pass
- bypass authorization
- weaken constraints because they are inconvenient
- create direct DB access from Tauri
- use JavaScript floating point for authoritative money
- delete posted payment records
- overwrite historical invoice data
- claim tests passed without running them

### Before accepting AI-generated code

Ask:

1. What business rule does this implement?
2. Where is the invariant protected?
3. What happens on failure/rollback?
4. Is the operation idempotent?
5. What prevents duplicates?
6. What audit record is produced?
7. What role can perform this action?
8. What happens under concurrent requests?
9. What test would fail if the implementation were wrong?
10. Can I explain the implementation during defense?

---

# 36. PRODUCT DEVELOPMENT ORDER

Use this order unless a real dependency requires adjustment:

```text
0. Agent skills + project rules
1. Repository foundation
2. Database foundation
3. Auth + RBAC
4. Subscribers + Plans + Service Accounts
5. Billing + Ledger
6. Payments + Allocation + Receipts
7. GCash verification
8. Collections + Remittance
9. AR + Aging
10. Suspension + Reconnection
11. Reports + Dashboard
12. Backup + Hardening
13. Three-PC LAN deployment
14. Full acceptance QA
15. Documentation + defense
```

Never move to advanced reports while billing/payment correctness is still unstable.

---

# 37. REQUIRED DEMO DATA

Seed synthetic/demo data:

- 5 users across roles
- 3 Internet plans
- 2 Cable plans
- 2 Combo plans
- 50 subscribers
- 60+ service accounts
- 2 collectors
- 3 collection areas
- at least 3 billing months
- Cash and GCash payments
- exact, partial and advance payments
- at least 10 overdue accounts across aging buckets
- at least 1 reversal/void example
- at least 2 suspension/reconnection scenarios

Never use real customer data.

---

# 38. USER ROLES

Implement at least:

### Owner / Super Admin

- full access
- reports
- configuration
- user management
- audit
- backup/restore

### Administrator

- subscribers
- plans
- service accounts
- billing
- collections
- operational reports

### Cashier

- subscriber search
- receive payment
- receipts
- balances
- approved GCash processing

### Collection Supervisor

- collectors
- routes
- batches
- remittance
- reconciliation
- performance

### Accounting / Auditor

- reports
- adjustments/reversals review
- AR
- audit trails

### Technician

- service status
- suspension/reconnection operational data
- no financial mutation privileges

### Read-only Viewer

- dashboards
- reports
- no mutation permissions

---

# 39. PRODUCTION-READY DEFINITION OF DONE

A feature is **not done** merely because the screen exists.

A feature is done only when all applicable conditions are true:

- requirement documented
- business rule documented
- backend implementation complete
- DB migration complete
- DB constraints reviewed
- API contract updated
- API tests added
- frontend UI complete
- frontend validation complete
- permissions enforced
- audit behavior implemented
- error/loading/empty states complete
- relevant E2E test complete
- logs are safe and useful
- documentation updated
- tests pass
- manual verification performed
- Git history is meaningful

For financial features, add:

- transaction boundary reviewed
- rollback behavior tested
- duplicate prevention tested
- money precision verified
- ledger effect verified
- audit effect verified

---

# 40. FINAL RELEASE CHECKLIST

## Architecture

- [ ] Two independent repositories exist.
- [ ] Tauri clients never connect to PostgreSQL.
- [ ] Fastify is the only operational database gateway.
- [ ] Frontend/backend contract is versioned.
- [ ] Three simultaneous clients can connect.

## Database

- [ ] Clean database can be created by migrations.
- [ ] Foreign keys exist.
- [ ] Unique constraints protect business identifiers.
- [ ] Duplicate billing is prevented.
- [ ] Receipt numbers never reuse voided values.
- [ ] Historical records are preserved.
- [ ] Important queries are indexed.
- [ ] AR can be reconciled to invoice balances.

## Financials

- [ ] Exact payment passes.
- [ ] Partial payment passes.
- [ ] Advance payment passes.
- [ ] Oldest-first allocation passes.
- [ ] Duplicate GCash reference protection passes.
- [ ] Reversal passes.
- [ ] Ledger balances reconcile.
- [ ] Collector shortage/overage passes.

## Security

- [ ] Passwords are hashed securely.
- [ ] RBAC enforced server-side.
- [ ] Audit logs exist.
- [ ] Sensitive secrets are not committed.
- [ ] Attachment validation exists.
- [ ] Tauri capability/native-command boundary is hardened.

## Reporting

- [ ] Daily/monthly collections.
- [ ] Billing vs collection.
- [ ] AR aging.
- [ ] Subscriber SOA.
- [ ] Collector performance/remittance.
- [ ] Payment method summary.
- [ ] Audit/payment adjustment reporting.
- [ ] PDF export.
- [ ] XLSX export.

## Reliability

- [ ] Backup creation works.
- [ ] Backup verification works.
- [ ] Restore test passed.
- [ ] Three-PC concurrency test passed.
- [ ] Error logs are useful.

## Academic defense

- [ ] Student can explain architecture.
- [ ] Student can explain every major database relationship.
- [ ] Student can explain payment allocation.
- [ ] Student can explain ledger correctness.
- [ ] Student can explain rollback behavior.
- [ ] Student can explain server-side authorization.
- [ ] Student can explain the Tauri security boundary and why the API remains authoritative.
- [ ] Student can explain testing evidence.
- [ ] Student can explain where AI was used and how its output was verified.

---

# 41. IMPLEMENTATION PHILOSOPHY

The quality target is not “a desktop app that looks complete.”

The target is:

```text
Professional UI
      +
Correct financial domain logic
      +
Transactional PostgreSQL data integrity
      +
Secure API boundary
      +
Server-side authorization
      +
Auditability
      +
Reliable reports
      +
Restore-tested backups
      +
Three-PC concurrency
      +
Automated tests
      +
Explainable engineering decisions
```

The system should behave like a small production business application while remaining appropriately simple for a laboratory project: **modular monolith, PostgreSQL, REST API, Tauri desktop client, strong domain rules, strong tests, and disciplined AI-assisted development.**

---

# 42. REFERENCE SOURCES FOR AGENT SKILLS

The following public repositories were checked while preparing this implementation plan:

- Anthropic Agent Skills: https://github.com/anthropics/skills
- Anthropic frontend-design skill: https://github.com/anthropics/skills/tree/main/skills/frontend-design
- Anthropic webapp-testing skill: https://github.com/anthropics/skills/tree/main/skills/webapp-testing
- obra/superpowers: https://github.com/obra/superpowers
- GitHub Awesome Copilot skills: https://github.com/github/awesome-copilot
- Caveman: https://github.com/JuliusBrussee/caveman
- Impeccable: https://github.com/pbakaus/impeccable
- UI/UX Pro Max: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- Emil Kowalski skills: https://github.com/emilkowalski/skills
- Taste Skill: https://github.com/jeettrench/taste-skill

### Tauri documentation used for this architecture

- Tauri 2 architecture: https://v2.tauri.app/concept/architecture/
- Tauri capabilities/security: https://tauri.app/security/capabilities/
- Tauri Windows installer: https://tauri.app/distribute/windows-installer/
- Tauri testing: https://v2.tauri.app/develop/tests/
- Tauri WebDriver testing: https://v2.tauri.app/develop/tests/webdriver/

Use the current upstream documentation when installation syntax, CLI commands, or supported configuration changes.

---

# 43. FIRST AGENT TASK

Before implementing any product feature, the coding agent must complete exactly this bootstrap sequence:

```text
1. Detect active coding-agent runtime.
2. Install compatible Agent Skills from the repositories listed in Section 0.
3. Verify the global Caveman skills are available and verify the four frontend design skills are available for frontend work only.
4. Read this PRODUCT.md completely.
5. Read the laboratory activity specification.
6. Inspect the centralized workspace root, `backend/`, and `frontend/` repositories (or create the two empty repositories if starting from zero).
7. Read the root `SKILLS.md` and verify there is no duplicate `SKILLS.md` inside either child repository.
8. Verify the root `package.json` is orchestration-only and that no `pnpm-workspace.yaml` exists.
9. Verify `backend/` and `frontend/` each retain their own `package.json` and `pnpm-lock.yaml`.
10. Produce a concise implementation inventory:
   - current files
   - missing foundation
   - current test status
   - current DB status
   - current API status
   - current UI status
11. Do NOT implement business features during this bootstrap step.
12. Produce Phase 0 implementation tasks.
13. Start implementation only after the bootstrap checks are recorded.
```

The first coding milestone is a **working foundation in both repositories**, not a partially implemented billing screen.
