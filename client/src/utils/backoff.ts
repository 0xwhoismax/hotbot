export function getReconnectDelay(
  attempt: number,
  multiplier = 2,
  maxDelay = 10000
): number {
  return Math.min(1000 * Math.pow(multiplier, attempt), maxDelay);
}
