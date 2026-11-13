import type { MarketBar } from '../../../../types/marketFeed';

/** Development only: the local market gateway holds candles for few coins, so CoinChart draws made-up ones for a coin it has none for.
 *  They walk from `from` to `to` in `step` candles and pass through every anchor (a pin's time and price, the latest mark), so pins and
 *  lines sit where real candles would put them. The same coin always draws the same candles. */
export function devCandles(seed: string, step: number, from: number, to: number, anchors: { t: number; p: number }[]): MarketBar[] {
  const points = anchors.filter(a => a.p > 0 && a.t >= from && a.t <= to).sort((a, b) => a.t - b.t);
  if (!points.length) return [];
  let state = [...seed].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16_777_619), 2_166_136_261) >>> 0;
  const random = () => { state = (state + 0x6d2b79f5) >>> 0; let x = Math.imul(state ^ (state >>> 15), 1 | state); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4_294_967_296; };
  const normal = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
  // Log-price moves about this much in one candle.
  const sigma = 0.03;
  const first = Math.floor(from / step) * step, count = Math.floor((to - first) / step) + 1;
  // Knots: the anchors, with free ends at the first candle's open and the last candle's close.
  const knots = [{ t: first, p: points[0].p * Math.exp(sigma * Math.sqrt((points[0].t - first) / step) * normal()) }, ...points];
  if (knots[knots.length - 1].t < first + count * step) knots.push({ t: first + count * step, p: points[points.length - 1].p * Math.exp(0.5 * sigma * normal()) });
  // A Brownian bridge in log price between each two knots, read at every candle edge.
  const edges = Array.from({ length: count + 1 }, (_, i) => first + i * step), level = new Array<number>(count + 1);
  for (let k = 0, e = 0; k < knots.length - 1; k++) {
    const a = knots[k], b = knots[k + 1], span = b.t - a.t;
    if (span <= 0) continue;
    const walk: number[] = [];
    let w = 0, at = a.t;
    for (let i = e; i < edges.length && edges[i] < b.t; i++) { w += sigma * Math.sqrt((edges[i] - at) / step) * normal(); at = edges[i]; walk.push(w); }
    const end = w + sigma * Math.sqrt((b.t - at) / step) * normal();
    for (let j = 0; j < walk.length; j++, e++) {
      const u = (edges[e] - a.t) / span;
      level[e] = Math.log(a.p) + u * Math.log(b.p / a.p) + walk[j] - u * end;
    }
  }
  level[count] ??= Math.log(knots[knots.length - 1].p);
  const rows: MarketBar[] = [];
  for (let i = 0; i < count; i++) {
    const o = Math.exp(level[i]), c = Math.exp(level[i + 1]), wick = () => Math.abs(normal()) * sigma * 0.4;
    rows.push({ t: edges[i], o, c, h: Math.max(o, c) * (1 + wick()), l: Math.min(o, c) * (1 - wick()), v: Math.exp(normal()) * 2_000 });
  }
  // A candle holding an anchor's time reaches its price.
  for (const { t, p } of points) {
    const row = rows[Math.floor((t - first) / step)];
    row.h = Math.max(row.h, p); row.l = Math.min(row.l, p);
  }
  return rows;
}
