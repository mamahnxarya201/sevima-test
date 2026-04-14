
---

## **How I Use AI Agents in This Project**

This document breaks down how I leverage every AI tool in my arsenal to build this project—and more importantly, how I keep them in check when they start hallucinating or throwing malformed junk at me.

### **Initial & Planning**
I start by grinding through the docs, basically explaining the app to myself until it clicks. I’m a big believer in the "notebook first" approach—scribbling rough plans and brainstorming flows by hand before touching the keyboard. Once I’ve grasped the core logic and decided on the execution (tech stack, libraries, and methods), then I’m ready to move.

### **Task Decoupling**
This is where the magic happens. I breakdown the tasks and start poking around with some **Rapid Application Development (RAD)**. My setup is strictly decoupled: **one agent per context.** * One for the API. 
* One for the Frontend. 
* One for DB logic. 
* One for DevOps & Git hygiene.

In this early stage, I keep the prompts loose. I let the agents "run wild" a bit just to see what patterns emerge before I tighten the leash.

### **Taking Shape**
Once **Stitch** (my UI design agent) spits out the visuals, I hook it up to the related agents via **MCP**. I tell them to implement the design while I’m busy architecting the backend engine. I’ll admit, I spent way too much time in this phase trying to find the "perfect path," but hey, that’s part of the craft.

### **Saving Memory (The "Contract")**
Decisions are useless if the agent forgets them five minutes later. I’ve moved away from external memory tools like OpenMemory because they don't live within the repo. Now, I use `.md` files directly in the codebase. 

These Markdown files act as a **source of truth** and a permanent contract between me and the agents. It ensures the project is portable—I can move to another machine, and the agents will still have their "memories" intact and ready to work.

### **Optimization Phase: The Reality Check**
Halfway through the project, I always do a deep audit on my agents' performance. In this build, I noticed two things: Claude was eating tokens like crazy (RIP billing), and Gemini was trying to be a "hero"—trying to do everything at once with hacky shortcuts.

To fix this, I shifted from "letting loose" to being surgical. I started co-authoring the plans and guiding their chain-of-thought with extreme specificity.

For the Claude instances, I implemented a custom skill/prompting style I call "Caveman." It’s a specialized constraint that strips away the fluff and forces the agent to communicate in raw logic. Results? 75% reduction in token usage with zero hit to performance. Better context window, cheaper bills, same output quality.