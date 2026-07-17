# Preset: greenfield delivery shape

## Entry

Empty `spec/` → constitution PR → intake → spec → design → plan → tasks → implement → review → deploy → operate.

## Checkpoints

| # | Question | Artifact |
| --- | --- | --- |
| 1 | Did we agree what to build? | `spec/spec.md` (+ features) merged |
| 2 | Is the architecture sound? | `spec/plan.md` approved |
| 3 | Does the PR do what we said? | Human merge of implementation PR |

## Task slicing

Prefer vertical slices that each deliver a testable scenario from `spec/features/`. Avoid "build all APIs then all UI" horizontal batches for the first milestone.

## Constitution type

**Aspirational** — how we intend to build. (Legacy projects use archaeological constitutions instead; not this bundle.)
