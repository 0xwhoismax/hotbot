export type WalletMovement = { mint: string; amount: number; native: boolean };
export type WalletActivityEvent = {
  signature: string; at: number | null; slot: number; position: number;
  kind: 'swap' | 'received' | 'sent' | 'movement' | 'transaction';
  status: 'confirmed' | 'failed'; feeSol: number; movements: WalletMovement[];
};
export type WalletActivityPage = { items: WalletActivityEvent[]; nextCursor: string | null };
