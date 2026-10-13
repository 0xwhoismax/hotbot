import { store } from '@/store/store';
import { authTokenAtom } from '@/store/user/atoms';
export async function solanaRpc<T = unknown>(method: string, params: unknown[]): Promise<T> {
  const token = store.get(authTokenAtom);
  if (!token) throw new Error('Authentication required');
  const res = await fetch('/api/solana-rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`Solana RPC failed: ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
  return json.result as T;
}

