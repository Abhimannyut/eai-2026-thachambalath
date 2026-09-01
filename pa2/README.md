# PA2 — RabbitMQ publish and consume

| | |
|---|---|
| **Session** | S2 — Messaging fundamentals · 2026-09-16, A410 |
| **Scaffold language** | TypeScript |
| **Published** | with S2 on 2026-09-16 |
| **Deadline** | **2026-09-28, 20:00 Europe/Riga** |
| **Hard cut-off** | **2026-10-05, 20:00** — miss it and the capstone is not graded |
| **Weight** | one seventh of the homework half — about 7.1% of the final grade |
| **Mark** | 70% automated tests, 30% manual (ADR quality, self-assessment honesty) |
| **ADR** | `docs/adr-001.md` |

---

## Not published yet

The brief, the starter code and the public tests arrive with S2 on **2026-09-16**.
This folder is a placeholder: the dates above are final, so you can plan
around them now.

**What it will cover.** A durable queue, publisher confirms, manual acknowledgement, and a correlation id carried from an HTTP request through to the consumer. Then three demonstrations of what survives a broker restart and what does not.

## What will be in here

```
README.md               the brief: what to build, how it is tested
starter/                scaffold with TODOs — you implement these
tests/public/           the tests you can run locally, as often as you like
docs/adr-001.md         your architecture decision record
docker-compose.yml      the services this assignment needs
```

Hidden tests are also run at grading time. They are never published, they
test the same requirements as the public ones, and they exist so that code
written to pass the visible tests specifically does not score well.

## Where your work goes

In **your** repository (`eai-2026-<surname>`), not this one:

```
eai-2026-<surname>/
  pa2/
    src/ …                your implementation
    docs/adr-001.md       required — a missing ADR fails a public test
```

See [how an assignment works](../README.md#how-an-assignment-works) in the
root README for the submission procedure, the late penalty and the
progression gate. Read [`../CONTRIBUTING.md`](../CONTRIBUTING.md) before
asking a question — it will usually be faster.
