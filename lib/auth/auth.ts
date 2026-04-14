/**
 * lib/auth/auth.ts
 *
 * Better Auth server configuration.
 * - emailAndPassword for login/register
 * - bearer() plugin: validates Authorization: Bearer <token> headers
 * - jwt() plugin: issues JWTs at /api/auth/token, JWKS at /api/auth/jwks
 *
 * JWT payload includes tenantId via definePayload (custom user field).
 * Routes: /api/auth/[...all]  (caught by app/api/auth/[...all]/route.ts)
 */

import { betterAuth } from 'better-auth';
import { bearer, jwt } from 'better-auth/plugins';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { managementDb } from '../prisma/management';

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  secret: process.env.BETTER_AUTH_SECRET ?? 'change-me',

  database: prismaAdapter(managementDb, { provider: 'postgresql' }),

  user: {
    additionalFields: {
      role: {
        type: 'string',
        defaultValue: 'VIEWER',
      },
      tenantId: {
        type: 'string',
      },
    },
  },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },

  plugins: [
    bearer(),
    jwt({
      jwt: {
        /**
         * Embed tenantId and role into the JWT payload.
         * These are read by the tenantGuard to resolve the correct tenant DB.
         */
        definePayload: ({ user }) => ({
          id: user.id,
          email: user.email,
          role: (user as any).role ?? 'VIEWER',
          tenantId: (user as any).tenantId ?? null,
        }),
        expirationTime: '8h',
      },
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
