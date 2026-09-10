---
description: "Frontend architecture: feature-based file organization, where business logic lives"
---

# Frontend Architecture

## File Organization

Organize frontend code by concept/feature (e.g., `Shifts/`, `Invites/`), not by type (no top-level `components/` or `hooks/`).

Within a feature directory: `api/` for data-fetching hooks, `components/`, `hooks/` for non-API hooks, `utils/` with co-located `*.test.ts` files, plus `Page.tsx`, `Router.tsx`, `paths.ts`, and `types.ts`.

## Business Logic Placement

Flag business logic in frontend code that should be a backend API call instead. Frontend/backend divergence causes bugs.
