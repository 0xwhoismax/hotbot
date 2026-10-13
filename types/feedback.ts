export const FEEDBACK_VERDICTS = [
  { id: 'want', title: 'I’d trade it', detail: 'A coin worth catching' },
  { id: 'untradable', title: 'Scam or can’t trade', detail: 'A rug, a spike or nothing to enter on' },
  { id: 'not', title: 'Not for me', detail: 'Nothing here worth trading' },
] as const;
export type FeedbackVerdict = typeof FEEDBACK_VERDICTS[number]['id'];
/** A point marked on the chart: a candle's close time (ms) and its close in USD. */
export type FeedbackMark = { t: number; priceUsd: number };
/** Limits: note length and saves per person per hour. */
export const FEEDBACK = { note: 500, perHour: 120 } as const;
