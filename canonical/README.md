# The canonical model

This folder will contain **one file**:

```
order.schema.json     the canonical order — a JSON Schema
```

It arrives with **PA4 on 2026-09-30** and does not change after that.

---

## Why it is a folder of its own

From PA4 onward every assignment reads or writes the same order shape:

| | |
|---|---|
| **PA4** | three unrelated input formats → this schema |
| **PA5** | the events you publish carry this shape |
| **PA6** | your API's `POST /checkout` accepts it |
| **PA7** | the Temporal workflow carries it through the saga |
| **capstone** | end to end, all of the above, one shape |

That is the entire argument for a canonical model, and you will feel it rather
than be told it: PA5 through PA8 do not require a single new translator,
because PA4 already did that work once. Systems that skip this step write
`n × (n−1)` translators instead of `2n`, and then maintain them.

**The schema is mine, not yours.** You do not design it and you do not get to
adjust it to suit your implementation — that is deliberate. Conforming to a
canonical model somebody else owns, including the parts of it you would have
designed differently, is the actual job.

---

## Nothing is here yet, on purpose

There is no draft schema in this folder, and that is not an oversight. A
half-correct schema published early is worse than no schema: some of you would
start building against it and would have to redo that work when it changed.

When it lands on 2026-09-30 it will be final.
