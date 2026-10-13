import { atomWithQuery } from 'jotai-tanstack-query';
import { atom } from 'jotai';
import { userStateAtom, authStateAtom, authTokenAtom, currentWalletAddressAtom } from './atoms';
import { solanaRpc } from '@/lib/rpc';
import { getReconnectDelay } from '@/utils/backoff';

/** Fetch SOL balance via the proxy RPC (avoids CORS with beta Helius) */
async function fetchSolBalance(address: string): Promise<number> {
    const result = await solanaRpc<{ value: number }>('getBalance', [address, { commitment: 'confirmed' }]);
    if (!Number.isFinite(result?.value) || result.value < 0) throw new Error('Invalid Solana balance response');
    return result.value / 1e9;
}

// --- WebSocket-driven SOL balance for instant updates ---

export const wsSolAddressAtom = atom<string | null>(null);
export const wsSolBalanceAtom = atom<number | null>(null);
export const wsSolConnectedAtom = atom(false);

/**
 * Opens a Helius WebSocket accountSubscribe for instant SOL balance updates.
 * Callbacks always receive SOL (not lamports). Call from a useEffect.
 */
export function createSolBalanceWs(
    address: string,
    onBalance: (sol: number) => void,
    onConnected: (connected: boolean) => void,
): () => void {
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? '';
    const wssUrl = rpcUrl
        .replace(/^https:\/\//, 'wss://')
        .replace(/^http:\/\//, 'ws://');
    if (!wssUrl || !wssUrl.startsWith('ws')) return () => {};

    let ws: WebSocket | null = null;
    let subId: number | null = null;
    let destroyed = false;
    let pingInterval: ReturnType<typeof setInterval> | null = null;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    function connect() {
        if (destroyed) return;
        ws = new WebSocket(wssUrl);

        ws.onopen = () => {
            subId = null;
            ws?.send(JSON.stringify({
                jsonrpc: '2.0', id: 1,
                method: 'accountSubscribe',
                params: [address, { encoding: 'jsonParsed', commitment: 'confirmed' }],
            }));
            pingInterval = setInterval(() => {
                if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'ping' }));
            }, 30_000);
        };

        ws.onmessage = (evt) => {
            try {
                const msg = JSON.parse(evt.data);
                if (msg.id === 1 && typeof msg.result === 'number') {
                    subId = msg.result;
                    attempt = 0;
                    onConnected(true);
                    return;
                }
                if (msg.id === 1 && msg.error) {
                    onConnected(false);
                    ws?.close();
                    return;
                }
                if (msg.method === 'accountNotification') {
                    const lamports = msg.params?.result?.value?.lamports;
                    if (typeof lamports === 'number') onBalance(lamports / 1e9);
                }
            } catch { /* ignore parse errors */ }
        };

        ws.onclose = () => {
            onConnected(false);
            if (pingInterval) clearInterval(pingInterval);
            if (!destroyed) reconnectTimer = setTimeout(connect, getReconnectDelay(attempt++));
        };

        ws.onerror = () => { ws?.close(); };
    }

    connect();

    return () => {
        destroyed = true;
        clearTimeout(reconnectTimer);
        if (pingInterval) clearInterval(pingInterval);
        if (ws && subId !== null && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'accountUnsubscribe', params: [subId] }));
        }
        ws?.close();
    };
}

const userSolBalanceQueryAtom = atomWithQuery((get) => {
    const solanaAddress = get(currentWalletAddressAtom);
    const auth = get(authStateAtom);
    const wsConnected = get(wsSolConnectedAtom);
    const accessToken = get(authTokenAtom);

    return {
        queryKey: ['userSolBalance', solanaAddress],
        queryFn: async () => {
            if (!solanaAddress) throw new Error('No Solana wallet found');
            const balance = await fetchSolBalance(solanaAddress);
            return { balance, address: solanaAddress };
        },
        enabled: !!solanaAddress && auth.ready && auth.authenticated && !!accessToken,
        staleTime: 10_000,
        gcTime: 30_000,
        refetchOnWindowFocus: !wsConnected,
        // The account subscription is the primary update path. Keep a slow
        // HTTP fallback only while the socket is down.
        refetchInterval: wsConnected ? false : 60_000,
        retry: 2,
    };
});

export const userSolBalanceAtom = atom((get) => {
  const query = get(userSolBalanceQueryAtom), address = get(currentWalletAddressAtom);
  const wsBalance = get(wsSolAddressAtom) === address ? get(wsSolBalanceAtom) : null;
  const rpcBalance = query.data?.address === address ? query.data.balance : null;
  const balance = address ? wsBalance ?? rpcBalance : null;
  const awaitingHydration = get(authStateAtom).authenticated && get(userStateAtom).loading;
  return { balance, hasBalance: balance !== null, hasWallet: !!address, address,
    isLoading: balance === null && (awaitingHydration || (!!address && !query.error)),
    error: query.error?.message ?? null, refetch: query.refetch };
});
