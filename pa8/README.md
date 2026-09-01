# PA8 — Capstone

PA8 **is** the capstone. The brief, the rubric and the integration test
suite live in [`../capstone/`](../capstone/) — this folder exists so that the
assignment numbering stays unbroken.

| | |
|---|---|
| **Session** | S8 — Operating what you built, and capstone kickoff · 2026-11-11, C113 |
| **Scaffold language** | TypeScript |
| **Published** | with S8 on 2026-11-11 |
| **Deadline** | **2026-11-25, 20:00 Europe/Riga** |
| **Hard cut-off** | none — this is the last submission of the course |
| **Weight** | **50% of the final grade** — the capstone half, not one of the seven weighted assignments |
| **Mark** | against `capstone/GRADING.md` (published with the brief — see [`../capstone/`](../capstone/)), 100 points (+15 Temporal bonus) |
| **Graded only if** | the progression gate is clear: Session 0 and PA1–PA7 all submitted before their cut-offs |
| **Must reach** | 50% in its own right |
| **ADR** | an ADR index, plus the per-assignment ADRs you already wrote |

---

## Not published yet

The brief, the starter code and the public tests arrive with S8 on **2026-11-11**.
This folder is a placeholder: the dates above are final, so you can plan
around them now.

**What it will cover.** Integration of your own PA4 to PA7 work into one running system.

## What will be in here

```
README.md               the brief: what to build, how it is tested
starter/                scaffold with TODOs — you implement these
tests/public/           the tests you can run locally, as often as you like
docs/                   an ADR index, alongside the ADRs you already wrote
```

Hidden tests are also run at grading time. They are never published, they
test the same requirements as the public ones, and they exist so that code
written to pass the visible tests specifically does not score well.

## Where your work goes

In **your** repository (`eai-2026-<surname>`), not this one:

```
eai-2026-<surname>/
  pa8/
    src/ …                your implementation
    docs/                 an ADR index, plus your PA1–PA7 ADRs
```

See [how an assignment works](../README.md#how-an-assignment-works) in the
root README for the submission procedure, the late penalty and the
progression gate. Read [`../CONTRIBUTING.md`](../CONTRIBUTING.md) before
asking a question — it will usually be faster.
