"use client";
import { ConvexReactClient } from 'convex/react';
import { api } from '../../convex/api';
export type { Id, Doc } from '../../convex/dataModel';
const url = process.env.NEXT_PUBLIC_CONVEX_URL;
export const convex = url ? new ConvexReactClient(url) : null;
export function requireConvexClient() {
  if (!convex) throw new Error('Database is not configured');
  return convex;
}
export { api };
/** Cached subscriptions (needs `ConvexQueryCacheProvider`, mounted once in `BasicsShell`): a query stays live for five minutes after its last
 *  screen unmounts, so revisiting a page shows current data at once instead of starting empty. */
export { ConvexQueryCacheProvider, usePaginatedQuery, useQuery } from 'convex-helpers/react/cache';
