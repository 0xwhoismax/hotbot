

/** An exit reason with its numbers taken out, so "Trailing stop: 15% below the high" and "… 10% …" are one family (as the lab groups them). */
export const exitFamily = (reason: string) => reason.replace(/\s*·.*$/, '').replace(/^You archived .*/, 'You archived the strategy').replace(/[0-9][0-9.,]*%|\$[0-9][0-9.,]*|[0-9]+ (min|h|hours?|minutes?)\b|[0-9]+×/g, '…').replace(/ +/g, ' ').trim();
