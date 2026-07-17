---
name: bcgov-public-service-minimums
description: Enforce tier-independent minimums for public-facing BC Gov services (WCAG, privacy, security, OpenShift, accountability).
---

# Skill: public-service minimums

When working on a **public-facing** BC Gov service (citizen or business users on the open internet), apply these rules even if the team is Tier 0 and has no Spec Kit.

## Must

1. Target **WCAG 2.1 AA**. Use B.C. Design System components; query the Design System MCP before UI work.
2. Do not introduce personal information flows without an explicit **PIA** status in the repo (`spec/plan.md` or `docs/public-service-minimums.md`).
3. Do not hard-code secrets. Do not log PI.
4. Prefer **OpenShift** deploy conventions; if another target is used, require an ADR.
5. Never self-merge. Leave evidence for human review.
6. Fill or update the checklist IDs in `docs/public-service-minimums.md` (from this pack's `checklist.md`).

## Refuse / escalate

Stop and ask a human if asked to:

- Ship UI that bypasses the design system "just this once" without an ADR
- Send production-like personal data to a public model endpoint
- Disable a11y or security CI to "get the demo green"
- Merge without a named reviewer for citizen-impacting changes

## Tools

- Prefer `bcgov-sdlc` MCP: `check_public_minimums`, `lint_constitution`, `validate_gherkin`
- Prefer `bc-design-system` MCP for components/tokens
