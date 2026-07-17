# Public-facing service minimums (tier-independent)

Service: {{SERVICE_NAME}}  
Owner: {{ACCOUNTABLE_OFFICER}}  
Last review: {{YYYY-MM-DD}}

Mark each item `done` / `n/a` (with rationale) / `gap`.

## Accessibility

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| A11Y-01 | WCAG 2.1 Level AA target documented | | |
| A11Y-02 | UI uses B.C. Design System components (or approved exception ADR) | | |
| A11Y-03 | Skip link to main content present | | |
| A11Y-04 | All form controls have visible labels | | |
| A11Y-05 | Icon-only controls have accessible names | | |
| A11Y-06 | Status is not colour-only | | |
| A11Y-07 | Automated a11y scan in CI (axe or equivalent) on critical journeys | | |

## Privacy

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| PRIV-01 | Data classification recorded | | |
| PRIV-02 | PIA completed before personal information in any env / model | | |
| PRIV-03 | No PI in logs, analytics, or AI prompts by default | | |
| PRIV-04 | Retention schedule identified | | |

## Security

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| SEC-01 | AuthN/AuthZ approach documented | | |
| SEC-02 | Secrets not in git; rotated via platform secret store | | |
| SEC-03 | Dependency scanning enabled on default branch | | |
| SEC-04 | Security review path known for classification | | |

## Operability

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| OPS-01 | Deploy target is OpenShift PaaS (or ADR exception) | | |
| OPS-02 | Health/readiness probes defined | | |
| OPS-03 | Support / incident contact path documented | | |
| OPS-04 | Decision/FOI trail reconstructable from git (spec + PR + evidence) | | |

## Accountability

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| ACC-01 | Named accountable officer for production changes | | |
| ACC-02 | Human merge required (no agent self-merge) | | |
| ACC-03 | Acceptance criteria ownership assigned (CODEOWNERS or named QA) | | |
