# Preset: BC Gov compliance (greenfield)

Use with Spec Kit / agent prompts for public-sector delivery.

## Constraints agents must not violate

1. **WCAG 2.1 AA** on all user-facing surfaces.
2. **B.C. Design System only** for UI primitives (`@bcgov/design-system-react-components`, tokens, BC Sans).
3. **PIA before personal information** in any environment or model call.
4. **OpenShift PaaS** as deploy target unless an ADR records an exception.
5. **Spec in git** — no silent scope changes in chat-only agreements.
6. **No self-merge** by agents; human checkpoint 3 remains.

## Spec quality bar

Reject or interrogate specs that:

- Mix technology choices into `spec.md` (those belong in `plan.md`)
- Use vague acceptance language ("fast", "user-friendly", "secure") without measurable criteria
- Omit error, empty, and authorization paths for user journeys
- Lack Gherkin (or equivalent) for citizen-facing flows

## Suggested MCP set

- `bc-design-system`
- `bcgov-sdlc` (constitution lint, acceptance criteria, OpenShift, FOI packer)
- Figma (when design is in scope)
- GitHub
