import { ConvexError } from 'convex/values';
import { store } from '@/store/store';
import { authTokenAtom } from '@/store/user/atoms';

/** Asks for an email code through the website (src/app/api/email-code/route.ts), which limits codes per network. A refusal throws a
 *  ConvexError with the words to show, as a Convex call would. */
export async function requestEmailCode(email: string) {
  const token = store.get(authTokenAtom);
  const response = await fetch('/api/email-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ email }),
  });
  if (response.ok) return;
  const body = await response.json().catch(() => null) as { error?: unknown } | null;
  throw typeof body?.error === 'string' ? new ConvexError(body.error) : new Error(`Email code request failed: ${response.status}`);
}
