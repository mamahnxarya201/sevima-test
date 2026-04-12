# Refined Architecture Plan: Jotai + Next.js App Router + React Flow

Thank you for clarifying! Knowing that the DAG Engine securely lives in the backend strictly shifts our front-end architecture away from "Local DAG evaluations" to purely serving as an **Ultra-Fast Stream Visualizer and Control Platform**.

Here is the refined technical approach addressing your specific concerns.

## 1. Safety of "Bypassing" React Flow
**Concern:** Will bypassing React Flow break its internal state?
**Resolution:** **No, it is 100% safe and highly recommended.** React Flow internally uses Zustand. It tracks exact node positions, array indexing, and edge connections. When we use Jotai for the `data.status` and `logs`, we aren't breaking React Flow's positioning—we are just stopping React Flow from re-evaluating the DOM for all 50 nodes every single time a WebSocket fires an update for just `Node-1`.

By offloading the "Volatile Status Data" to Jotai, React Flow's `setNodes` function will strictly only be invoked when physical structural things happen (like dragging a node, or connecting an edge).

## 2. Separation of State & Action Handling
You asked how we will handle user actions like typing, clicking, and dragging. We will split the state gracefully:

### A) Topology & Configuration State (Owned by React Flow)
**What it handles:**
- **Canvas Events:** Dragging nodes, panning the viewport, and connecting line edges (Native XYFlow functionality).
- **Form Values:** Whenever the user types inside a node (e.g., editing the URL inside `HttpNode`), we will manage the input via a local `useState` for immediate keystrokes to ensure ultra-smooth typing, and only push the final value back up to React Flow's `updateNodeData` when the user's focus leaves the input field (`onBlur`). 
*Doing this allows `reactFlowInstance.toObject()` to still cleanly export the entire correct user blueprint when it's time to save.*

### B) Volatile Execution State (Owned by Jotai `atomFamily`)
**What it handles:**
- **WebSocket Feeds:** Streaming logs, execution status indicators (running, failed, success).
- **Granular Buttons:** Clicking a "Retry Task" button will trigger an event locally within the node that fires a native browser `fetch()` call back to your DAG engine without disrupting the UI structure.

## 3. Implementation Steps

Since `jotai` is perfectly installed and your backend rules the execution domain, we are clear to advance smoothly:

### Phase 1: Pure Jotai Execution Mapping
- [ ] Create `stores/executionStore.ts` utilizing a Jotai `atomFamily`.
- [ ] This `atomFamily(id => atom({...}))` will contain standard keys for `status`, `logs`, and `errorText`.

### Phase 2: Updating Custom Nodes (Action Handling)
- [ ] Inside `BaseNode` and our 5 Custom Nodes, safely delete our mock `data.status` checks and switch them to simply call `const [execState] = useAtom(executionStore(nodeId))`.
- [ ] Expose an `id` prop down into `BaseNode` so it uniquely targets its Jotai store matching the Node's ID.

### Phase 3: Simulated Connection & Native Fetch
- [ ] Because you instructed absolutely **No Axios**, we will map our API integration handlers utilizing the native Web Fetch API and the native global `WebSocket` namespace.
- [ ] (Optional for MVP execution): Create a lightweight background hook at `app/page.tsx` that simulates taking in pseudo-WebSocket JSON payloads and selectively `set`ting only the specific modified atom.

---

> [!IMPORTANT]
> **Awaiting Approval**
> We have fully partitioned your blueprint configuration (React Flow) away from your high-frequency socket payloads (Jotai), all without breaking structural context. If everything looks good, I will begin modifying `BaseNode.tsx` and mapping out the `executionStore.ts`.
