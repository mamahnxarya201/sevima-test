# Code Review Exercise

## The Code Under Review

A teammate has opened a PR titled **"feat: add workflow duplication endpoint"** with the following implementation. Review it as you would a real PR.

```typescript
// app/api/workflows/[id]/duplicate/route.ts

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@/lib/generated/tenant-client";

const prisma = new PrismaClient();

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const newTitle = body.title || "Copy of workflow";

    // Get the original workflow
    const original = await prisma.workflow.findUnique({
      where: { id: params.id },
      include: { versions: true },
    });

    if (!original) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Duplicate workflow with all versions
    const duplicated = await prisma.workflow.create({
      data: {
        title: newTitle,
        description: original.description,
        ownerId: original.ownerId,
      },
    });

    for (const version of original.versions) {
      await prisma.workflowVersion.create({
        data: {
          workflowId: duplicated.id,
          version: version.version,
          definition: version.definition as any,
          editorState: version.editorState as any,
          createdAt: new Date(),
        },
      });
    }

    return NextResponse.json(duplicated, { status: 201 });
  } catch (error) {
    console.log("Duplication failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

---

## Review Feedback

### [CRITICAL] No authentication or authorization

**Location:** entire handler

The endpoint has no auth check. Any unauthenticated request can duplicate any workflow in any tenant's database. Every tenant-scoped API route in this project must use `resolveTenantContext(request)` from `lib/auth/tenantGuard.ts` to verify the Bearer JWT, resolve the correct tenant database, and extract the caller's role.

Additionally, duplication is a mutation — it must call `requireEditorOrAbove(ctx.role)` to enforce RBAC. Viewers should not be able to duplicate workflows.

```typescript
// Required pattern:
const ctx = await resolveTenantContext(request);
requireEditorOrAbove(ctx.role);
const { tenantDb } = ctx;
// Use tenantDb instead of a global prisma instance
```

---

### [CRITICAL] Global PrismaClient — wrong database entirely

**Location:** `const prisma = new PrismaClient();`

This instantiates a PrismaClient with the default `TENANT_DATABASE_URL` from the environment, which points to a single migration-time database — not the requesting tenant's database. In production this means every request hits the same DB regardless of tenant, breaking data isolation.

The correct approach is to use the `tenantDb` returned by `resolveTenantContext`, which calls `getTenantDb(connectionUrl)` using the tenant's specific `connectionUrl` from the management database.

**Delete this line** and use `ctx.tenantDb` throughout.

---

### [HIGH] No input validation

**Location:** `const body = await request.json();`

- `request.json()` can throw on malformed input and will produce an uncontrolled 500 error. Use `readJsonBody(request)` from `lib/api/jsonBody.ts`, which enforces a size limit and returns structured errors.
- `body.title` is used without validation. It could be an object, a 10MB string, or contain control characters. Add a Zod schema:

```typescript
import { z } from "zod";

const duplicateSchema = z.object({
  title: z.string().min(1).max(255).optional(),
});
```

- `params.id` is not validated as a UUID. Use the existing `workflowIdParamSchema` from `lib/api/schemas/workflow.ts`.

---

### [HIGH] No rate limiting

**Location:** entire handler

All mutation endpoints require rate limiting per the project's API standards. This endpoint should call `enforceRateLimit` keyed by `userId` before doing any database work.

```typescript
await enforceRateLimit(
  `workflows:duplicate:${ctx.userId}`,
  mutationMax,
  windowMs
);
```

---

### [HIGH] N+1 query pattern — versions created in a loop

**Location:** `for (const version of original.versions) { await prisma.workflowVersion.create(...) }`

Each version fires a separate `INSERT` statement sequentially. For a workflow with 20 versions, that is 20 round trips. Use `createMany` or wrap in a transaction:

```typescript
await tenantDb.$transaction(async (tx) => {
  const duplicated = await tx.workflow.create({ ... });
  await tx.workflowVersion.createMany({
    data: original.versions.map((v) => ({
      workflowId: duplicated.id,
      version: v.version,
      definition: v.definition ?? undefined,
      editorState: v.editorState ?? undefined,
    })),
  });
  return duplicated;
});
```

This also ensures atomicity: if version creation fails, the workflow itself is rolled back instead of leaving an orphan.

---

### [MEDIUM] `ownerId` copied from original — should be the current user

**Location:** `ownerId: original.ownerId`

The duplicated workflow's owner is set to whoever created the *original*, not the person performing the duplication. This means the duplicate may show up in the wrong user's "my workflows" list and grants implicit ownership to someone who didn't request it.

Use the authenticated user's ID from the JWT context:

```typescript
ownerId: ctx.userId,
```

---

### [MEDIUM] Error logging with `console.log` instead of `console.error`

**Location:** `console.log("Duplication failed:", error);`

Two issues:
1. `console.log` for errors — use `console.error` so structured log collectors (CloudWatch, Loki) can filter by severity.
2. In production, logging the full `error` object might dump stack traces containing internal paths or query parameters. Log a sanitized message and the error name/message, not the entire object.

---

### [MEDIUM] `as any` type casts on JSON fields

**Location:** `definition: version.definition as any, editorState: version.editorState as any`

`as any` silences TypeScript entirely. These fields are `Json` type in Prisma, which maps to `Prisma.JsonValue`. If the types don't align, fix the type at the source rather than casting. If the value is `JsonValue | null`, handle the null case explicitly:

```typescript
definition: version.definition ?? Prisma.JsonNull,
```

---

### [LOW] Error response doesn't use `apiErrorResponse`

**Location:** catch block

The project has a centralized `apiErrorResponse` helper (`lib/api/respond.ts`) that maps `ZodError`, `AuthError`, `RateLimitError`, and other known error types to consistent response shapes. Using raw `NextResponse.json` here means this endpoint's error format will differ from every other route.

Replace with:

```typescript
return apiErrorResponse(error);
```

---

### [LOW] Missing response shape for the created resource

**Location:** `return NextResponse.json(duplicated, { status: 201 });`

The response returns the raw Prisma model, which may include internal fields and will certainly change shape if the schema changes. Consider returning a defined response shape and including the duplicated workflow's versions in the response so the client doesn't need a follow-up fetch.

---

### [NITPICK] Hardcoded fallback title

**Location:** `const newTitle = body.title || "Copy of workflow";`

Using `||` means an empty string `""` also falls through to the default, which may or may not be intended. If the Zod schema has `.min(1)`, this is fine, but without validation, a client sending `{ title: "" }` gets "Copy of workflow" silently. Prefer `??` for nullish-only coalescing once validation is in place.

---

## Summary

| Severity | Count | Summary |
|----------|-------|---------|
| CRITICAL | 2 | No auth/authz, wrong database connection |
| HIGH | 3 | No input validation, no rate limiting, N+1 without transaction |
| MEDIUM | 3 | Wrong ownerId, bad log level, `as any` casts |
| LOW | 2 | Inconsistent error format, raw Prisma response |
| NITPICK | 1 | `\|\|` vs `??` semantics |

**Verdict:** Request changes. The two critical issues (missing auth and wrong database) make this endpoint a security vulnerability as-is — it must not be merged until those are resolved. The high-severity items should also be fixed in this PR; the medium and low items can be addressed as fast follow-ups if the author prefers, but I'd recommend fixing them now while the code is fresh.
