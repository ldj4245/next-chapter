import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { SupabaseClient } from '@supabase/supabase-js';

export type MobileSession = {
  user: { id: string; email: string };
  client: SupabaseClient;
  request: Request;
};

const sessions = new AsyncLocalStorage<MobileSession>();

export function mobileSession(): MobileSession | undefined {
  return sessions.getStore();
}

export function isAuthenticatedMobileRequest(request: Request): boolean {
  return sessions.getStore()?.request === request;
}

export function withMobileSession<T>(session: MobileSession, action: () => T): T {
  return sessions.run(session, action);
}
