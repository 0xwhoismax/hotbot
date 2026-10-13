import { atom } from 'jotai';
import { fetchTokenData } from '@/services/marketDataService';

const SOL_MINT = "So11111111111111111111111111111111111111112";

// Shared SOL/USD estimate for wallet controls, refreshed every minute while mounted.
export const solPriceAtom = atom<{ data: number | null; isLoading: boolean; error?: string }>({
  data: null,
  isLoading: true,
});

solPriceAtom.onMount = (set) => {
  let isActive = true;

  const fetchSolPrice = async () => {
    try {
      const tokenData = await fetchTokenData(SOL_MINT);
      if (!isActive) return;
      if (!tokenData?.price || !Number.isFinite(tokenData.price)) throw new Error('SOL price unavailable');
      set({ data: tokenData.price, isLoading: false });
    } catch {
      if (!isActive) return;
      set(previous => ({ ...previous, isLoading: false, error: 'SOL price unavailable' }));
    }
  };

  fetchSolPrice();
  const interval = setInterval(fetchSolPrice, 60_000);
  return () => {
    isActive = false;
    clearInterval(interval);
  };
};
