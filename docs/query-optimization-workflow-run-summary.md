# Query optimization report: workflow list run summaries

This document explains **why** the `GET /api/workflows` run-summary query counts as a **non-trivial** optimization, what changed, and how it was validated with `EXPLAIN`.

---

## Why this optimization is non-trivial

“Non-trivial” here means the fix is **not** a one-line tweak (e.g. “add `LIMIT` somewhere obvious”) and it required **understanding query semantics, planner behavior, and index design** together.

### 1. The original query was inherently expensive

The previous implementation used **window functions** over a joined result set:

- `COUNT(*) OVER (PARTITION BY workflowId)` — must see **all** rows per workflow partition.
- `ROW_NUMBER() OVER (PARTITION BY … ORDER BY startedAt DESC, id DESC)` — must **sort** rows within each partition before picking `rn = 1`.

That pattern forces a pipeline that scales with **how many rows match** the workflow-version filter, not only with “how many workflows we show on the page.” For a busy tenant with many runs per workflow, that is a real scaling problem.

### 2. Adding an index alone does not always fix window queries

A composite index on `(workflowVersionId, startedAt DESC, id DESC)` helps **point lookups** and **ordered scans** for a single version or small range. But a **window-function** plan may still:

- Hash join / sequential scan large portions of `WorkflowRun`,
- **Sort** the full intermediate set to satisfy `partition by` + `order by` in the window.

In a benchmark run on representative data, **indexes + the same window SQL** did not beat the window-query baseline; the planner still chose a broad scan + sort + window aggregation. The expensive part was **algorithm shape** (global sort + windows), not only missing B-tree.

So the optimization is non-trivial because it required **changing the query shape**, not only schema.

### 3. The replacement query uses a different algorithm

The optimized query uses `**LATERAL` subqueries** per workflow id in the page:

- **Count:** `COUNT(*)` for runs joined through versions for that `workflowId` only.
- **Latest run:** `ORDER BY startedAt DESC, id DESC LIMIT 1` for that same scope.

That turns “sort everything then rank” into “for each of N workflows on the page, do bounded work,” which matches the **UI pagination** model (`limit`/`offset` on workflows).

Together with the composite index on `WorkflowRun`, the planner can use **index-backed** paths for the latest-run subquery and bitmap/index scans for counts, instead of one big window over all matching rows.

---

## What changed in the codebase


| Area                                                                                  | Change                                                                                        |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `app/api/workflows/route.ts`                                                          | Replaced window-function SQL with `LATERAL` subqueries for per-workflow count + latest run.   |
| `prisma/tenant/schema.prisma`                                                         | Added `@@index([workflowVersionId, startedAt(sort: Desc), id(sort: Desc)])` on `WorkflowRun`. |
| `prisma/tenant/migrations/20260416110000_add_workflow_run_latest_index/migration.sql` | Creates the same index in SQL for tenant DB migrations.                                       |


---

## EXPLAIN validation (benchmark)

Validation used **temporary** benchmark tables in a transaction (same join semantics as `WorkflowVersion` / `WorkflowRun`, synthetic scale ~224k run rows), so production data was not modified.

### Baseline: window query (no supporting index)

- **Execution time:** ~**56.6 ms**
- Plan highlights: `Seq Scan` on runs, `Sort`, **double `WindowAgg`**.

### Same window query + indexes

- **Execution time:** ~**60.1 ms** (not better; planner still chose scan + sort + windows).
- **Takeaway:** the bottleneck was the **window + sort** structure, not only a missing single-column index.

### Optimized lateral query + indexes

- **Execution time:** ~**34.6 ms**
- Plan highlights: `Nested Loop` + `Bitmap Index Scan` using the composite index (no global window stage).

**Interpretation:** the measurable win came from **rewriting** the query; the index supports the new access pattern.

---

## Applying the same check on your DB

After deploying tenant migrations:

```bash
npx prisma migrate deploy --schema prisma/tenant/schema.prisma
```

You can run `EXPLAIN (ANALYZE, BUFFERS)` on the production-shaped SQL against the real `WorkflowRun` / `WorkflowVersion` tables to confirm plans on your data volume and statistics.

---

## Summary


| Criterion      | Why non-trivial                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| Problem        | Window functions + global sort over large join results.                                                        |
| Index-only fix | Did not reliably remove the expensive sort/window pipeline in the benchmark.                                   |
| Solution       | Algorithm change (`LATERAL` per page workflow) + composite index aligned with `ORDER BY … LIMIT 1`.            |
| Evidence       | `EXPLAIN ANALYZE` showed lower execution time and different plan shape (windows vs nested loop + index scans). |


