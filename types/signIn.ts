/** How long after a sign-in a person may add or remove a way to sign in. After that they confirm it's them by signing in again with a way they already use,
 *  so a copied token or a session left open can't take an account over. */
export const RECENT_SIGN_IN_MS = 10 * 60_000;
/** Digits in an email sign-in code. */
export const EMAIL_CODE_DIGITS = 8;
