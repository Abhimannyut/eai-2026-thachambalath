# PA5 — Events, dead-letter queues, idempotency

| | |
|---|---|
| **Session** | S5 — Reliable messaging and error handling · 2026-10-14, A410 |
| **Scaffold language** | TypeScript |
| **Published** | with S5 on 2026-10-14 |
| **Deadline** | **2026-10-26, 20:00 Europe/Riga** |
| **Hard cut-off** | **2026-11-02, 20:00** — miss it and the capstone is not graded |
| **Weight** | one seventh of the homework half — about 7.1% of the final grade |
| **Mark** | 70% automated tests, 30% manual (ADR quality, self-assessment honesty) |
| **ADR** | `docs/adr-004.md` |

---

## Not published yet

The brief, the starter code and the public tests arrive with S5 on **2026-10-14**.
This folder is a placeholder: the dates above are final, so you can plan
around them now.

**What it will cover.** Publishing domain events, a dead-letter queue with a retry path, and making a consumer idempotent so that redelivery is safe.

## What will be in here

```
README.md               the brief: what to build, how it is tested
starter/                scaffold with TODOs — you implement these
tests/public/           the tests you can run locally, as often as you like
docs/adr-004.md         your architecture decision record
docker-compose.yml      the services this assignment needs
```

Hidden tests are also run at grading time. They are never published, they
test the same requirements as the public ones, and they exist so that code
written to pass the visible tests specifically does not score well.

## Where your work goes

In **your** repository (`eai-2026-<surname>`), not this one:

```
eai-2026-<surname>/
  pa5/
    src/ …                your implementation
    docs/adr-004.md       required — a missing ADR fails a public test
```

See [how an assignment works](../README.md#how-an-assignment-works) in the
root README for the submission procedure, the late penalty and the
progression gate. Read [`../CONTRIBUTING.md`](../CONTRIBUTING.md) before
asking a question — it will usually be faster.
