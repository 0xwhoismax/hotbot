"use client";
import { Bot, ChartColumn, Clock, Coins, Droplets, Hand, Link, Lock, Receipt, Scale, ShieldCheck, Sparkles, TrendingDown, TrendingUp, Users, Zap, type LucideIcon } from 'lucide-react';
import type { PlainIcon, PlainRule } from '../../../../types/team';
import { signedSol } from './format';
import s from './team.module.css';

const ICONS: Record<PlainIcon, LucideIcon> = {
  sparkles: Sparkles, clock: Clock, coins: Coins, droplets: Droplets, chart: ChartColumn, users: Users, lock: Lock, shield: ShieldCheck,
  'trending-up': TrendingUp, 'trending-down': TrendingDown, scale: Scale, receipt: Receipt, zap: Zap, hand: Hand, bot: Bot, link: Link,
};

/** What a strategy looks for or how it buys, in plain words: one chip each, from `plainRules`. */
export function PlainChips({ chips }: { chips: PlainRule[] }) {
  return <ul className={s.plainChips}>{chips.map(chip => { const Icon = ICONS[chip.icon]; return <li key={chip.text} className={s.plainChip} data-group={chip.group}><Icon aria-hidden/>{chip.text}</li>; })}</ul>;
}

/** One exit reason's profit: `example` as written, its latest sale, trades and SOL made. */
export type ExitBar = { key: string; example: string; lastAt: number; pnlSol: number; trades: number };
const DAY = 86_400_000, EXIT_ROWS = 8, toneOf = (x: number) => Math.abs(x) < 5e-4 ? '' : x > 0 ? s.up : s.down;
const day = (at: number) => new Date(at).toLocaleString('en-US', { month: 'short', day: 'numeric' });
/** Each exit's profit as a bar either side of zero, winners first; an exit not seen for a day says when it last happened. */
export function ExitBars({ exits, now }: { exits: ExitBar[]; now: number }) {
  const rows = [...exits].sort((a, b) => b.pnlSol - a.pnlSol), shown = rows.length > EXIT_ROWS ? [...rows.slice(0, EXIT_ROWS / 2), ...rows.slice(-EXIT_ROWS / 2)] : rows;
  const max = Math.max(1e-9, ...shown.map(row => Math.abs(row.pnlSol)));
  return <ul className={s.exitBars}>{shown.map(row => <li key={row.key}>
    <span className={s.exitBarLabel} title={row.key}>{row.example}{now - row.lastAt > DAY && <em>last {day(row.lastAt)}</em>}</span>
    <span className={s.exitBarTrack}><i data-tone={row.pnlSol >= 0 ? 'up' : 'down'} style={{ width: `${Math.abs(row.pnlSol) / max * 50}%`, [row.pnlSol >= 0 ? 'left' : 'right']: '50%' }}/></span>
    <span className={`${s.num} ${toneOf(row.pnlSol)}`}>{signedSol(row.pnlSol, 2).replace(' SOL', '')}<small>{row.trades}</small></span>
  </li>)}</ul>;
}
