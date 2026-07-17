# Constitution — {{SERVICE_NAME}}

> Aspirational constitution for a **greenfield** BC Gov digital service.
> Replace `{{…}}` placeholders. Amend via pull request; do not silently override platform articles.

**Ministry / program:** {{MINISTRY}}  
**Service:** {{SERVICE_NAME}}  
**Data classification:** {{internal | public | sensitive}}  
**Deploy target:** OpenShift Private Cloud PaaS  
**Last reviewed:** {{YYYY-MM-DD}}

---

## Platform articles (do not remove)

### P1 — Accessibility

All user-facing interfaces SHALL meet **WCAG 2.1 Level AA**. Accessibility is a legal duty for public-facing services, not a tier opt-in. Prefer B.C. Design System components that encode accessible behaviour (React Aria). Do not ship colour-only status, unlabeled icon buttons, or missing form labels.

### P2 — Design system

UI SHALL use `@bcgov/design-system-react-components` and `@bcgov/design-tokens`. Do not invent buttons, inputs, headers, or hard-coded brand colours. Agents MUST query the BC Design System MCP (or equivalent) before generating UI. Load BC Sans via `@bcgov/bc-sans`.

### P3 — Privacy

No personal information MAY enter a system, log, model prompt, or third-party AI API until a **Privacy Impact Assessment (PIA)** appropriate to the classification is complete and recorded. Prefer synthetic or anonymized fixtures in lower environments.

### P4 — Deploy target

Production and primary lower environments SHALL target **OpenShift** on the BC Gov Private Cloud PaaS unless an ADR explicitly documents an exception. Follow Private Cloud conventions (health probes, resource limits, no privileged containers by default).

### P5 — Spec as source of truth

Intent lives in versioned git under `spec/` (`spec.md`, `plan.md`, `tasks.md`, `features/*.feature`, this constitution). Chat is not the system of record. FOI-relevant decisions MUST be reconstructable from git artifacts.

### P6 — Human checkpoints

Humans own: (1) spec sign-off, (2) plan/architecture approval, (3) review & ship. Agents MUST NOT self-merge. Agent branches only; Actions on agent PRs require human approval where org policy requires it.

### P7 — Test integrity

Default: acceptance criteria owned under CODEOWNERS (or equivalent human review). The same agent session SHOULD NOT both author production code and solely author the only acceptance proof for high-risk behaviour without human QA sign-off.

### P8 — Approved tools

Agents MAY only use approved MCP servers and model routes for this classification. Sensitive workloads MUST NOT send source or data to public model endpoints outside policy.

---

## Project articles (customize)

### J1 — Service purpose

{{One paragraph: who the service is for and what outcome it delivers.}}

### J2 — In scope / out of scope

- **In:** {{…}}
- **Out:** {{…}}

### J3 — Forbidden patterns

- {{e.g. direct JDBC from the UI tier; storing SIN; custom auth bypassing Entra}}

### J4 — Domain language

| Term | Meaning |
| --- | --- |
| {{Term}} | {{Definition}} |

### J5 — Non-functional baselines

- Availability / support hours: {{…}}
- Performance: {{…}}
- Retention: {{…}}

---

## Amendment

Changes to platform articles require platform / architecture guild agreement.  
Changes to project articles require the project's usual PR review (checkpoint 2 reviewers for material architecture impact).
