'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { BotPortrait, botInfo, type BotRole } from './BotPortrait';
import characterDesign from '../../../../public/hotbot/cloud-agents/character-design.json';
import styles from './hotbot.module.css';

type WorldRole = Exclude<BotRole, 'hotbot'>;
type WorldInstance = { play(): void; destroy(): void };
const sceneVersion = 'always-play-1';
declare global {
  interface Window {
    CloudCharacterDesign?: typeof characterDesign;
    CloudMaterials?: unknown;
    CloudSceneAssets?: unknown;
    CloudAgents?: { version: string; dispose(): void; mount(element: HTMLElement, role: WorldRole): WorldInstance };
  }
}
let runtime: Promise<void> | undefined;
function loadSceneScript(file: string, loaded: () => boolean) {
  if (loaded()) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `/hotbot/cloud-agents/${file}.js?v=${sceneVersion}`;
    const fail = () => { clearTimeout(timer); script.remove(); reject(new Error('The animated scene could not load.')); };
    const timer = setTimeout(fail, 30000);
    script.onload = () => { clearTimeout(timer); if (loaded()) resolve(); else fail(); };
    script.onerror = fail;
    document.head.append(script);
  });
}
function loadRuntime() {
  window.CloudCharacterDesign = characterDesign;
  if (window.CloudAgents?.version === sceneVersion) return Promise.resolve();
  if (!runtime) runtime = (async () => {
    // Fast Refresh must replace the external runtime too, not keep its old RAF loop.
    window.CloudAgents?.dispose?.();
    window.CloudAgents = undefined;
    window.CloudMaterials = undefined;
    window.CloudSceneAssets = undefined;
    // These libraries are independent; avoid an extra network round trip on mobile.
    await Promise.all([
      loadSceneScript('materials', () => !!window.CloudMaterials),
      loadSceneScript('scene-assets', () => !!window.CloudSceneAssets),
    ]);
    await loadSceneScript('agents', () => !!window.CloudAgents);
  })().catch(error => { runtime = undefined; throw error; });
  return runtime;
}

/** Owns mounting and cleanup; the runtime always plays and only sleeps while hidden or offscreen. */
export function CloudWorld({ role }: { role: WorldRole }) {
  // A mounted node is an effect dependency: tab presence can attach it after the first render.
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!host) return;
    let disposed = false;
    let instance: WorldInstance | undefined;
    setError(false);
    setReady(false);
    loadRuntime().then(() => {
      if (!disposed && window.CloudAgents) {
        instance = window.CloudAgents.mount(host, role);
        instance.play();
        setReady(true);
      }
    }).catch(() => { if (!disposed) setError(true); });
    return () => { disposed = true; instance?.destroy(); };
  }, [host, role, attempt]);
  return <div className={styles.worldStage} aria-busy={!ready && !error}>
    <div ref={setHost} className={styles.worldCanvas} />
    {!ready && <div className={styles.sceneLoading} role="status">
      <BotPortrait role={role} decorative/>
      <p>{error ? 'The scene couldn’t connect.' : `Opening ${botInfo[role].name}’s world…`}</p>
      {error && <Button variant="outline" size="sm" onClick={() => setAttempt(value => value + 1)}>Reload animation</Button>}
    </div>}
  </div>;
}
