import { v, type Infer } from 'convex/values';
const takeProfit = v.object({ gainPct: v.number(), sellPct: v.number(), pullbackPct: v.optional(v.number()) });
const stopLoss = v.object({ lossPct: v.number(), sellPct: v.number(), trailing: v.optional(v.boolean()), trailDistancePct: v.optional(v.number()), armAtGainPct: v.optional(v.number()), afterMinutes: v.optional(v.number()), widenAtGainPct: v.optional(v.number()), widenToPct: v.optional(v.number()) });
/** `scaleOut`: after the take-profits, sells `sellPct` of the bag at +`fromPct` and again at every further `stepPct` (compounding). `lockStepPct`: each
 *  full step the coin climbs locks in the step below it. `stall`: once up `armAtGainPct`, sells what is left when `minutes` pass without a new high. */
export const tradePresetTargetConfig = v.object({ name: v.string(), takeProfits: v.array(takeProfit), stopLosses: v.array(stopLoss), sellSlippageBps: v.optional(v.number()),
  scaleOut: v.optional(v.object({ fromPct: v.number(), stepPct: v.number(), sellPct: v.number() })), lockStepPct: v.optional(v.number()), stall: v.optional(v.object({ armAtGainPct: v.number(), minutes: v.number() })) });
export type TradePresetTargetConfig = Infer<typeof tradePresetTargetConfig>;
