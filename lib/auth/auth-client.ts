/**
 * lib/auth/auth-client.ts
 *
 * Better Auth client for use in React components and client-side code.
 * Use this to: sign in, sign up, get session, retrieve JWT tokens.
 *
 * Usage:
 *   const { data, error } = await authClient.signIn.email({ email, password })
 *   const { data: token } = await authClient.token()   // get JWT for ws auth
 */

import { createAuthClient } from 'better-auth/client';
import { jwtClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  plugins: [jwtClient()],
});

export type { Session } from './auth';
