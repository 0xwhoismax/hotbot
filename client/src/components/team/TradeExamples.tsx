"use client";
import { useLayoutEffect, useState } from 'react';
import type { Example } from '../../../../types/lab';
import { secondsText } from '../../../../types/inactivity';
import { numText } from './Parts';
import s from './team.module.css';

const NAMES: Record<Example['kind'], string> = { win: 'Typical win', median: 'Median trade', loss: 'Typical loss' };
const gainText = (x: number) => { const n = Math.round(x * 100); return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}%`; };
const L = 4, R = 4, TOP = 16, BOTTOM = 6;

/** One trade: the coin's candles, the pick, the span held, the buy and each sale with its gain (its reason on hover). */
function Trade({ example, onOpen }: { example: Example; onOpen: (mint: string) => void }) {
  // Drawn at its real width, so labels keep their size from a phone to a wide column.
  const [box, setBox] = useState<SVGSVGElement | null>(null), [W, setW] = useState(240);
  useLayoutEffect(() => {
    if (!box) return;
    const measure = () => setW(Math.max(160, Math.round(box.getBoundingClientRect().width)));
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    measure();
    return () => observer.disconnect();
  }, [box]);
  const H = Math.round(Math.min(170, Math.max(130, W * 0.6)));
  const { kind, symbol, read, entry, sales, ret, bars } = example, last = sales[sales.length - 1];
  const at = (t: number) => (t - bars.from) / bars.step, ratio = (priceUsd: number) => priceUsd / read.priceUsd;
  const count = Math.max(bars.rows.length ? bars.rows[bars.rows.length - 1][0] + 1 : 1, Math.ceil(at(last.at)) + 1);
  const marks = [ratio(entry.priceUsd), ...sales.map(sale => ratio(sale.priceUsd))];
  const hi = Math.max(...bars.rows.map(row => row[2]), ...marks), lo = Math.min(...bars.rows.map(row => row[3]), ...marks), pad = (hi - lo) * 0.04 || 0.02;
  const x = (pos: number) => L + (W - L - R) * pos / count, y = (r: number) => TOP + (H - TOP - BOTTOM) * (hi + pad - r) / (hi - lo + 2 * pad);
  const body = Math.max(1, (W - L - R) / count * 0.62);
  const anchor = (to: number) => to < L + 22 ? 'start' : to > W - R - 22 ? 'end' : 'middle';
  // A sale's figure only where it doesn't run into the one before; each sits above its dot unless that leaves the chart.
  const labelled = new Set<Example['sales'][number]>();
  for (let i = 0, room = -Infinity; i < sales.length; i++) { const to = x(at(sales[i].at)); if (to - room >= 34) { labelled.add(sales[i]); room = to; } }
  const above = (r: number) => y(r) - 8 < 10 ? y(r) + 15 : y(r) - 8;
  const supply = read.capUsd ? read.capUsd / read.priceUsd : null, held = last.at - entry.at;
  const story = `${symbol}: bought ${secondsText(Math.round((entry.at - read.at) / 1000))} after the pick, ${sales.map(sale => `${sale.reason} at ${gainText(sale.ret)}`).join(', ')}; ${gainText(ret)} after costs`;
  return <figure className={`${s.surface} ${s.example}`}>
    <figcaption className={s.exampleHead}>
      <b>{NAMES[kind]}</b>
      <span className={Math.round(ret * 100) > 0 ? s.up : Math.round(ret * 100) < 0 ? s.down : s.muted}>{gainText(ret)}</span>
    </figcaption>
    <button type="button" className={s.exampleCoin} onClick={() => onOpen(example.mint)}>{symbol}<small>{new Date(read.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}</small></button>
    <svg ref={setBox} className={s.exampleGraph} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={story}>
      <rect className={s.gHeld} x={x(at(entry.at))} y={TOP - 4} width={Math.max(1, x(at(last.at)) - x(at(entry.at)))} height={H - TOP - BOTTOM + 4}/>
      <line className={s.gPick} x1={x(at(read.at))} x2={x(at(read.at))} y1={TOP - 4} y2={H - BOTTOM}/>
      <text x={x(at(read.at))} y={TOP - 6} textAnchor={anchor(x(at(read.at)))}>Pick</text>
      {bars.rows.map(([step, o, h, l, c]) => <g key={step} className={c >= o ? s.gCandleUp : s.gCandleDown}>
        <line x1={x(step + 0.5)} x2={x(step + 0.5)} y1={y(h)} y2={y(l)}/>
        <rect x={x(step + 0.5) - body / 2} y={y(Math.max(o, c))} width={body} height={Math.max(0.8, Math.abs(y(o) - y(c)))}/>
      </g>)}
      <g className={s.gBuyMark}>
        <circle cx={x(at(entry.at))} cy={y(ratio(entry.priceUsd))} r={4}/>
        <text x={x(at(entry.at))} y={y(ratio(entry.priceUsd)) + 15 > H ? above(ratio(entry.priceUsd)) : y(ratio(entry.priceUsd)) + 15} textAnchor={anchor(x(at(entry.at)))}>Buy</text>
      </g>
      {sales.map((sale, i) => { const n = Math.round(sale.ret * 100), cx = x(at(sale.at)), r = ratio(sale.priceUsd);
        return <g key={i} className={n > 0 ? s.gGainMark : n < 0 ? s.gLossMark : s.gBuyMark}>
          <title>{`${sale.reason} · sold ${Math.round(sale.share * 100)}% at ${gainText(sale.ret)}`}</title>
          <circle cx={cx} cy={y(r)} r={4}/>
          {labelled.has(sale) && <text x={cx} y={above(r)} textAnchor={anchor(cx)}>{gainText(sale.ret)}</text>}
        </g>; })}
    </svg>
    <div className={s.exampleFacts}>
      {supply && <span>${numText('usd', entry.priceUsd * supply)} → ${numText('usd', last.priceUsd * supply)}</span>}
      <span>{secondsText(Math.round(held / 1000))}</span>
    </div>
  </figure>;
}

/** The three trades side by side, a narrow column swipes between them; while the first replay runs, their places pulse. `examples`: undefined
 *  until the Lab answers. */
export function TradeExamples({ examples, days, onOpen }: { examples: Example[] | undefined; days: number | null; onOpen: (mint: string) => void }) {
  return <section className={s.exampleFrame} aria-label="Example trades">
    {!examples ? <div className={s.examples} role="status" aria-label="Replaying the last days">{[0, 1, 2].map(n => <div key={n} className={`${s.surface} ${s.example} ${s.ghost}`}><i className={s.exampleGhost}/></div>)}</div>
      : examples.length ? <div className={s.examples}>{examples.map(example => <Trade key={example.kind} example={example} onOpen={onOpen}/>)}</div>
      : <p className={s.empty}>No closed trade in {days ? `the last ${days} days` : 'the last days'}</p>}
  </section>;
}
