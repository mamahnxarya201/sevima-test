# App Screenshots Guide

This document explains the core pages and user flow shown in the provided screenshots.

## 1) Canvas Builder (workflow logic design)

Canvas Builder

What this screen shows:

- The visual DAG canvas where users build automation steps as connected nodes.
- A sample branch flow using:
  - `ACTION` node (HTTP/API call),
  - `LOGIC CONTROL` condition node,
  - `COMPUTE` script nodes on true/false branches.
- Top action bar with key controls:
  - `Checkpoint` (version snapshot),
  - `Settings`,
  - `Debug JSON`,
  - `Run Workflow`.
- Left floating toolbox to add new node types quickly.

Why it matters:

- This is the primary authoring experience. Users design runtime behavior without writing backend orchestration code manually.

---

## 2) Execution Logs Hub (run history across workflows)

Execution Logs

What this screen shows:

- Tenant-wide timeline of historical runs.
- Search and sort controls for filtering run records.
- Each run row includes:
  - final status badge (`SUCCESS`/`FAILED`),
  - workflow name and version,
  - trigger source,
  - pass/fail step counts,
  - execution duration and relative timestamp.
- Right-side summary cards for quick operational metrics (runtime, total runs, stream status).

Why it matters:

- Gives operators a single place to investigate outcomes and drill into failures after execution.

---

## 3) Monitoring Dashboard (Grafana view)

Monitoring Dashboard

What this screen shows:

- Embedded monitoring page with near real-time system health metrics.
- KPI cards for:
  - active runs,
  - total runs in window,
  - success/failure rates,
  - average execution time,
  - scheduler queue state.
- Trend charts for run timeline and step duration percentiles.

Why it matters:

- Complements run-by-run logs with aggregate operational visibility and performance trends.

---

## 4) Workflows List + New Workflow Modal

New Workflow Modal

What this screen shows:

- Workflows index page with modal-driven creation flow.
- `New workflow` modal fields:
  - `Name` (required),
  - `Description` (optional).
- Immediate handoff from creation into canvas editing after submit.

Why it matters:

- This is the entry point for authoring. It keeps creation lightweight and moves users directly into builder mode.

---

## 5) Live Run in Canvas (in-progress execution sidebar)

Canvas Live Run

What this screen shows:

- A running workflow on the same canvas used for authoring.
- Node-level execution state feedback (e.g., active/running highlighting).
- Right execution panel with:
  - current step status and progress,
  - lock state while run is in progress,
  - latest run summary/history at the bottom.
- Top bar run indicators changing from start to running state.

Why it matters:

- Connects design-time and runtime in one place, enabling fast debug loops.

---

## End-to-End User Journey (from these screenshots)

1. Create workflow in the list page modal.
2. Build node graph in canvas.
3. Save/checkpoint and run.
4. Observe live node execution in canvas sidebar.
5. Review historical outcomes in Execution Logs.
6. Monitor aggregate health in Monitoring dashboard.