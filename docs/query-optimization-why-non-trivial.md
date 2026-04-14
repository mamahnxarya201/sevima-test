# Why the workflow run-summary optimization is “non-trivial”

A **trivial** database change might be: add a missing primary key, add `LIMIT` where the app forgot it, or add one obvious index on a foreign key that every ORM expects.

This work is **non-trivial** because:

1. **The expensive part was the SQL algorithm, not a single missing column.**
  Window functions (`ROW_NUMBER`, `COUNT` over partitions) require sorting and scanning large intermediate results. Fixing that usually means **rewriting the query**, not only adding `CREATE INDEX`.
2. **An index did not automatically fix the old query.**
  In a benchmark, the same window query with a composite index still used a plan dominated by **sequential scan + sort + window aggregation**. The planner could not reduce that to “cheap index-only” work because windows still need ordered partitions over **all** matching rows.
3. **The fix required coordinated changes.**
  - **Query:** per-workflow `LATERAL` subqueries (count + latest run with `LIMIT 1`).  
  - **Schema:** composite index on `(workflowVersionId, startedAt DESC, id DESC)` so “latest run per version” and joins align with how PostgreSQL can scan.
4. **Proof needed measurement.**
  `EXPLAIN (ANALYZE, BUFFERS)` showed **different plan shapes** and **lower execution time** for the rewritten query than for the window version at the same data scale.

For the full write-up (code locations, migration, EXPLAIN summary), see [query-optimization-workflow-run-summary.md](./query-optimization-workflow-run-summary.md).