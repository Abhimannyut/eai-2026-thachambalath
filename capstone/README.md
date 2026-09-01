# The capstone (PA8)

| | |
|---|---|
| **Kickoff** | S8 — 2026-11-11, C113 |
| **Deadline** | **2026-11-25, 20:00 Europe/Riga** |
| **Weight** | **50% of the final grade** |
| **Graded only if** | the progression gate is clear — Session 0 and PA1–PA7 all submitted before their cut-offs |
| **Must reach** | 50% in its own right |
| **Defence** | oral exam, ~20 min, at least two weeks after S8 |
| **Individual** | yes. Not a group project |

---

## Not published yet

The brief, the rubric and the integration test suite arrive with S8 on
**2026-11-11**. What is on this page now is fixed, so you can plan for it.

## What it is

**An integration of your own PA4–PA7 work into one running system.** Not a
fresh start.

```
order intake
  → canonical transformation            (PA4)
  → event publication, DLQ, idempotency (PA5)
  → orchestrated saga with compensation (PA6)
  → Temporal                            (PA7 — bonus, not required)
  → correlation propagated end to end, visible in a trace endpoint
```

By 2026-11-11 you will already have written every piece of this. The capstone
is the work of making them one system, which is a different and harder problem
than any of them individually — and it is the problem the course is actually
about.

## What will be in here

```
README.md              what to integrate, the required endpoints, deliverables
GRADING.md             the rubric: 100 points, +15 bonus for Temporal
tests/integration/     the end-to-end black-box suite
docs/                  diagram requirements, ADR index
```

`GRADING.md` is published at the same time as the brief, in full. You will
know exactly what is being scored before you start.

## What it is graded on

The rubric is published with the brief. It scores, among other things:

- services start and pass their health checks from a clean clone
- canonical conformance across all three input formats
- compensation ordering, observable in the trace
- correlation propagated end to end
- a poison message reaching the DLQ, and being replayable from it
- architecture diagrams: system context, integration architecture, orchestration flow
- a pattern mapping table, and a failure analysis
- an ADR index
- an AI-usage disclosure

## Why it reuses your own work

Because of the exam. The defence includes an **incident drill**: a copy of your
own capstone with a fault planted in it, which you diagnose live using the
logs, traces and tests you built.

That only works on code you actually wrote. It is also why your git history
matters — it is the evidence of authorship, accumulated over eleven weeks
rather than produced in the last one.

---

## Between now and 2026-11-11

Nothing to do here. But two habits from PA4 onward make November much easier,
and both are free:

1. **Keep your ADRs honest as you go.** The capstone requires an ADR index.
   Seven ADRs written when each decision was fresh beats seven written in a
   panic in November, and the manual 30% of each assignment is already paying
   you to do it.
2. **Do not delete or rewrite your PA4–PA7 code once it passes.** You are
   going to integrate it. A working PA5 is a capstone component, not a
   finished homework you can tidy away.
