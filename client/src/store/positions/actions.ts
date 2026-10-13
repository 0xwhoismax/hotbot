import { queryClient } from '@/lib/queryClient';
export function invalidateNativeBalanceAfterSwap() { void queryClient.invalidateQueries({ queryKey: ['userSolBalance'] }); }
