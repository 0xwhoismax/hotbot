// TOTP per RFC 6238: HMAC-SHA1, 30-second steps, 6 digits. A code from the step before or after also passes, for clock drift.
export const TOTP = { stepSeconds: 30, digits: 6, drift: 1 } as const;
export const BACKUP_CODES = { count: 10, length: 8 } as const;
/** The error a Real SOL step throws without a fresh code; the client asks for one and runs the step again. */
export const FRESH_CODE_ERROR = 'Enter your two-factor code to trade Real SOL.';
