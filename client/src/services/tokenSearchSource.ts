import type { TokenData } from '@/types/dataApiTypes';
import type { SearchSource } from './solanaTokenSearch';

// Token normalization includes trading venue metadata. Load that SDK-backed
// implementation only when a search actually starts, not with every dashboard.
export const tokenSearchSource: SearchSource<TokenData> = async (query, signal, sort) => {
  const { solanaTokenSource } = await import('./solanaTokenSearch');
  if (signal.aborted) throw new DOMException('Search cancelled', 'AbortError');
  return solanaTokenSource(query, signal, sort);
};
