import { z } from 'zod';

export const registerTenantBodySchema = z
  .object({
    tenantName: z.string().trim().min(1).max(200),
    adminEmail: z.string().trim().min(3).max(320).email(),
    adminPassword: z.string().min(8).max(256),
  })
  .strict();

export type RegisterTenantBody = z.infer<typeof registerTenantBodySchema>;
