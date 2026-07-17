# Plan — {{SERVICE_NAME}}

> Architecture and delivery approach. Technology belongs here (not in `spec.md`).

## Summary

{{How we will realize the spec.}}

## Architecture

```text
{{e.g. Browser → OpenShift Route → Service → API → DB}}
```

## Key decisions (ADRs may expand)

| Decision | Choice | Rationale |
| --- | --- | --- |
| UI | B.C. Design System React | Constitution P2 |
| Hosting | OpenShift PaaS | Constitution P4 |
| Auth | {{Entra / …}} | {{…}} |

## Security & privacy

- Classification: {{…}}
- PIA status: {{not started / in progress / complete — link}}
- Secrets: {{…}}

## Test approach

- Default integrity tier: **CODEOWNERS on acceptance criteria**
- Features under `spec/features/` owned by: {{QA lead / path}}

## Rollout

- Environments: {{dev / test / prod}}
- Migration / cutover: {{n/a for greenfield}}

## Approval (checkpoint 2)

| Role | Name | Date |
| --- | --- | --- |
| Architect / tech lead | | |
| Security (if required) | | |
