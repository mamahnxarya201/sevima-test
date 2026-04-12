# DAG-Based Task Runner MVP & State Architecture

This document answers your architectural queries and proposes an implementation plan for integrating Jotai into our React Flow Next.js MVP.

## 1. Analysis: Jotai vs Traditional Stores (Zustand/Context)

For a workflow designer receiving per-second WebSocket updates across highly decoupled nodes, **Jotai is absolutely not overkill—it is arguably the most pragmatic choice.** 

Traditional stores like Context require complex memoization, and while Zustand is lightweight, dealing with deeply nested graph payloads often requires careful subset selectors to avoid triggering re-renders across the entire canvas when a single node's status switches from `running` to `success`.

**Why Jotai perfectly matches your MVP:**
- **Granularity (O(1) updates):** You can update `node-3`'s streaming script logs without React Flow or `node-1` being aware the update ever occurred. This is a massive DX benefit for high-frequency WebSocket streams.
- **Derived Atoms for Edges:** You can natively derive a node's readiness utilizing Jotai's ability to arbitrarily subscribe to upstream atoms (`get(get(upstreamNodeId).status)`).

### Next.js App Router (SSR) Isolation
In the App Router, placing Jotai atoms in the global module scope technically shares them across all users *if* the components render on the server. To ensure strict request isolation per-user, we simply wrap our client boundary (the `WorkflowPrototyper` component) inside a Jotai `<Provider>`. This guarantees an isolated store instance per request lifetime.

---

## 2. Proposed Architecture

### State Topology
We will partition our state to play to the strengths of both tools currently in our stack:
1. **XYFlow (React Flow's native Zustand store):** Manages strictly the XY coordinates, topology, edge mapping, and viewport selection. 
2. **Jotai `atomFamily`:** Manages the underlying execution payload mapping, real-time WebSocket statuses (`status`, `error`, `logs`, `isLoading`).

### The Derived DAG Structure
For conditional logic and multi-node outputs (e.g., Node C waits for A and B), we can build an asynchronous `evaluationAtom` that watches the global `edges` array (from React Flow) to map out dependencies. When Node A or B completes, they update their respective Jotai atom state, which naturally cascades the "ready" signal down the derived atom DAG chain to Node C. 

## 3. Implementation Steps

### Phase 1: Setup Jotai & The Atom Family
- [ ] Install `jotai`.
- [ ] Create a `stores/workflowStore.ts` utilizing `atomFamily` to construct individual execution states based on a dynamic string `nodeId`.

### Phase 2: App Router SSR Safeguarding
- [ ] Wrap the main canvas structure inside a Jotai `<Provider>` boundary to isolate React Server Component memory constraints.

### Phase 3: Node UI Detachment
- [ ] Refactor our new `BaseNode.tsx` to stop reading arbitrary properties from `data.status` and instead consume a `useAtom(nodeExecutionFamily(id))`. 
- [ ] All WebSocket (or mock execution) per-second polling loops will simply dump into `jotaiStore.set(nodeExecutionFamily(nodeId), payload)`, completely bypassing React Flow's `setNodes` engine to sidestep unnecessary reconciliation sweeps.

---

> [!WARNING] 
> **Open Question for You:** 
> Do you want the DAG *execution logic* living purely in the front-end (having Jotai derived atoms automatically evaluate and sequentially flip upstream logic branches), or is the front-end strictly going to *display* arbitrary WebSocket payloads streamed directly from an existing backend server logic? 

Are you satisfied with this plan? If so, I will install `jotai` and begin rewiring our `BaseNode` interface to run directly off an `atomFamily` map!
