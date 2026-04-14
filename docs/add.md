## **Architecture Design Decision (ADD)**

### **1. State Management: Jotai**

For the frontend, I decided to go with **Jotai** instead of more "heavyweight" solutions. After consulting and weighing the complexity, Jotai’s atomic approach fits perfectly with this project's need for a lean but highly reactive state. It avoids the boilerplate hell of Redux while giving more granular control than standard Context API. Small, fast, and stays out of the way.

### **2. Observability & Reporting: The LGP Stack (Loki, Grafana, Prometheus)**

One of the key decisions was offloading the dashboard and reporting logic to **Grafana**. 

**The Rationale:**

- **The "Never-Ending Change" Factor:** Based on my experience, dashboards are the most volatile part of any system. Requirements change every week. Building a custom dashboard from scratch is a massive **time-waster**.
- **Speed to Market:** Instead of reinventing the wheel with custom charts and reporting modules, I plugged in **Prometheus** for metrics and **Loki** for logs. 
- **Built-in Reporting:** Clients and stakeholders always end up asking for PDF reports, alerts, and deep-dive analytics. Grafana handles this out of the box, letting me focus on the core engine of the project rather than fighting with D3.js or Chart.js for basic stuff.

### **3. Tech Stack: Next.js as the Unified Powerhouse**

I’ve decided to go full-stack with **Next.js**, handling both the frontend and the backend logic within the same ecosystem. No NestJS, no Laravel, no extra weight.

**The Rationale:**

- **Native Backend Capabilities:** Next.js provides everything I need through API Routes and Server Actions. Adding another framework would just introduce unnecessary complexity and latency. 
- **Seamless Integration:** Having the entire codebase in one place speeds up development and simplifies deployment.
- **The WebSocket Workaround:** While Next.js doesn't support WebSockets natively out of the box, I handled this by patching it with `**next-ws`**. This allows me to maintain a real-time layer without the overhead of spinning up a separate backend service.

### **4. Task Execution: Ephemeral Containerized Workflows**

For the task runner, every single workflow triggers a **new ephemeral container** managed by a **custom orchestrator**.

**The Rationale:**

- **Safety from the Start:** This is a non-negotiable security decision. By running tasks in isolated containers, I ensure that each process is sandboxed. If something goes wrong—or if there's malicious input—it stays contained. 
- **Zero Persistence:** Since the containers are ephemeral, they vanish immediately after the task is done. No leftover junk, no side effects, just a clean slate every time.
- **Custom Orchestrator:** I built a custom layer to handle this instead of relying on heavy-duty tools, giving me full control over how resources are allocated and recycled.