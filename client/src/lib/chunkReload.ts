"use client";
import { useEffect } from 'react';

/** A code file of the build this tab loaded that the server no longer has: a deploy replaced the build, so a reload loads the new one.
 *  Turbopack and webpack name the error ChunkLoadError; the browsers word a failed `import()` each their own way. */
const CHUNK_LOAD = /Failed to load chunk|Loading (CSS )?chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;
const RELOADED_AT = 'hotbot:chunk-reload';
/** A tab reloads for a missing chunk at most once in this time, so a chunk that the new build lacks too cannot loop. */
const RELOAD_GAP_MS = 60_000;

function reloadedRecently() {
  try { return Date.now() - Number(sessionStorage.getItem(RELOADED_AT)) < RELOAD_GAP_MS; }
  catch { return true; }
}

/** True while the page reloads for a missing chunk, in place of the error screen. */
export function useChunkReload(error: Error) {
  const reloading = (error.name === 'ChunkLoadError' || CHUNK_LOAD.test(error.message)) && !reloadedRecently();
  useEffect(() => {
    if (!reloading) return;
    try { sessionStorage.setItem(RELOADED_AT, String(Date.now())); } catch { return; }
    location.reload();
  }, [reloading]);
  return reloading;
}
