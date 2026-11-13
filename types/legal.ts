/** The Terms with the Privacy policy, and the Real SOL risk notice, each with its version. The /terms and /privacy pages and both consent
 *  dialogs show this text; a consent row keeps the version and the hash of the text accepted (`legalHash`), which Convex computes itself.
 *  A change of either text raises its version, so everyone accepts it again; the worker then holds new Real SOL buys until they do. */
import { PLATFORM_FEE_BPS } from './swapCosts';
import { ADDRESS_LOCK_DAYS } from './withdrawal';

export const LEGAL_KINDS = ['terms', 'realSol'] as const;
export type LegalKind = typeof LEGAL_KINDS[number];

/** Who HOTBOT is and where, as the legal texts name it. */
const PARTY = {
  entity: 'Hot Bot LLC', email: 'usehotbot@gmail.com', effective: 'October 2, 2026', address: '30 N Gould St Ste R, Sheridan, WY 82801, USA',
  keys: 'Your wallet is provided by Crossmint. You hold its recovery, and only you can approve a withdrawal. To trade for you, HOTBOT also holds a trading key, which its signing rules limit to trades (see the Real SOL risk notice).',
  providers: 'Crossmint (your wallet provider)', seat: 'Sheridan, Wyoming, under the rules of the American Arbitration Association', jurisdiction: 'the State of Wyoming, USA',
} as const;
/** Cloudflare's country codes that get no $HOTBOT buy link: the UK, an unknown country and Tor. */
export const BLOCKED_COUNTRIES = new Set(['GB', 'XX', 'T1']);

/** Text runs mark **bold** and [links](/path). A `table`'s first row is its head; a `note` is a boxed variant. */
export type LegalBlock = string | { list: string[] } | { table: string[][] } | { note: string; blocks: LegalBlock[] };
export type LegalSection = { id: string; title: string; blocks: LegalBlock[] };
export type LegalDoc = { title: string; intro: LegalBlock[]; short: string; sections: LegalSection[] };

// Formatted by hand, not with Intl: the browser and Convex must build the same text, byte for byte, for its hash.
const pct = (bps: number) => `${bps / 100}%`;

const KEY = 'The wallet and its funds are yours. HOTBOT can only sign swaps from it, with their fees, and can’t withdraw or send anything else.';

export const TERMS: LegalDoc = {
  title: 'Terms of Service',
  intro: [`**Effective date:** ${PARTY.effective}`,
    `These Terms are an agreement between you and ${PARTY.entity}, a Wyoming limited liability company (“Hot Bot”, “we”, “us”) about usehotbot.com, the Hot Bot app, and everything we provide (the “Platform”). By using the Platform you agree to these Terms and our [Privacy Policy](/privacy). If you don’t agree, don’t use it.`],
  short: 'Hot Bot is software, not financial advice. You make your own decisions, you can lose everything, and we are not responsible for your losses. Disputes go to individual arbitration, not class actions or juries.',
  sections: [
    { id: 'software', title: '1. We provide software', blocks: [
      'Hot Bot is an independent software business. We make tools for researching Solana tokens and running automated trading strategies that you choose and set up. We are not a broker, exchange, adviser, fund, bank or money transmitter, we are not registered as any of these, and we owe you no fiduciary duty.'] },
    { id: 'advice', title: '2. Not financial advice', blocks: [
      'Nothing on the Platform, in our app, from our team or on our social accounts is financial, investment, legal or tax advice, or a recommendation to trade anything. Strategies, signals, backtests, simulations, PnL figures and other data may be wrong or out of date, and past results mean nothing about the future. Do your own research.'] },
    { id: 'responsibility', title: '3. Your decisions, your responsibility', blocks: [
      'What you do with the Platform is entirely up to you. You choose whether and how to trade, which strategies to run, and how much money to use. Every trade placed for you is placed because you set it up. You are responsible for your results, your account and wallet security, and making sure using the Platform is legal where you are.'] },
    { id: 'risks', title: '4. You accept the risks', blocks: [
      'Trading memecoins is extremely risky. You accept every risk of using the Platform, including:',
      { list: ['losing some or all of your money, fast;', 'tokens going to zero, rug pulls, scams and vanishing liquidity;',
        'slippage, failed, delayed or front-run transactions, and exits that fill late or not at all;', 'fees (network, DEX and ours) that are charged whether you win or lose;',
        'bugs, outages, hacks, bad data, and failures of the blockchain or third-party services; and', 'changes in law or regulation.'] },
      'Blockchain transactions are final. Nobody can reverse them. Only use money you can afford to lose.'] },
    { id: 'eligibility', title: '5. Who can use Hot Bot', blocks: [
      `You must be 18 or older. You can’t use the Platform if you’re in a sanctioned or restricted country, on a sanctions list, or anywhere it would be illegal, and you can’t use a VPN to get around that. Access is invite-only and at our discretion.`] },
    { id: 'wallets', title: '6. Wallets, fees and $HOTBOT', blocks: [
      { list: [
        `**Wallet.** We set up a Solana wallet for you to use with Hot Bot. ${PARTY.keys} We will never ask for your private key or seed phrase.`,
        '**Access charge.** The $20 access charge and the $HOTBOT and USDC or SOL sent at sign-up pay for access to the software. They are not an investment and are non-refundable.',
        '**Platform fee.** We charge a fee on trades, shown in the app. We can change our fees at any time. Third-party fees are separate and not ours.',
        '**$HOTBOT.** Holding $HOTBOT gives you access, nothing more: no ownership, profit share or rights in Hot Bot, and no promise about its value.',
        '**Trades.** We don’t guarantee any trade will be placed, land or fill at any price. We may refuse, delay or limit trading at our discretion.'] }] },
    { id: 'taxes', title: '7. Taxes', blocks: [
      'You alone are responsible for reporting and paying any taxes on your trading. We don’t give tax advice or withhold anything for you.'] },
    { id: 'misuse', title: '8. Don’t misuse it', blocks: [
      'Don’t break the law, manipulate markets, use dirty money, hack, scrape, reverse engineer or overload the Platform, share or sell your access, or impersonate anyone. We can suspend or end your access at any time, for any reason, without notice or liability.'] },
    { id: 'third-parties', title: '9. Third parties', blocks: [
      'The Platform depends on things we don’t control, like Solana, pump.fun, PumpSwap, wallet providers and data providers. We are not responsible for them or anything they do.'] },
    { id: 'ownership', title: '10. Our stuff', blocks: [
      'We own the Platform, its software, name and content. You get a personal, revocable right to use it under these Terms. If you send us feedback, we can use it freely.'] },
    { id: 'warranties', title: '11. No warranties', blocks: [
      'The Platform is provided **“as is” and “as available”**, with no warranties of any kind, to the fullest extent the law allows. We don’t promise it will work, be secure, be accurate, or make you money.'] },
    { id: 'liability', title: '12. Limitation of liability', blocks: [
      'To the fullest extent the law allows, Hot Bot and its owners, team and partners are **not liable for any losses or damages of any kind** arising from the Platform or your use of it, including trading losses, lost profits, and indirect or consequential damages. If we are ever found liable, our total liability is capped at the greater of the fees you paid us in the previous 3 months or US $100. This doesn’t limit liability that the law says can’t be limited.'] },
    { id: 'indemnity', title: '13. You cover us', blocks: [
      'You agree to cover Hot Bot and its owners and team for any claims, losses and legal costs arising from your use of the Platform, your trades, or your breach of these Terms or the law. You release us from any claims connected to your disputes with other users, token creators or third parties.'] },
    { id: 'disputes', title: '14. Disputes', blocks: [
      `Contact us first at ${PARTY.email} and give us 60 days to sort it out. If we can’t, the dispute goes to confidential, binding arbitration before one arbitrator in ${PARTY.seat}. **Claims can only be brought individually, never as a class or representative action, and both sides waive a jury trial.** Claims must be brought within one year. You can opt out of arbitration by emailing us within 30 days of first accepting these Terms. These Terms are governed by the laws of ${PARTY.jurisdiction}.`] },
    { id: 'other', title: '15. Everything else', blocks: [
      'We can change the Platform or these Terms at any time; using the Platform after a change means you accept it. If part of these Terms is unenforceable, the rest still applies. Not enforcing a term isn’t a waiver. You can’t transfer your rights under these Terms; we can. We aren’t responsible for events outside our control. These Terms and our [Privacy Policy](/privacy) are the whole agreement.',
      `Questions: ${PARTY.email}`, `${PARTY.entity}, ${PARTY.address}`] },
    { id: 'last', title: 'One last thing', blocks: [
      'The fastest way to lose 100% of your profits isn’t a rug pull. It’s skipping your capital gains taxes. The tax office runs the only bot in crypto with a perfect hit rate, so please pay them.'] },
  ],
};

export const PRIVACY: LegalDoc = {
  title: 'Privacy policy',
  intro: [`**Effective date:** ${PARTY.effective}`,
    `This policy explains what ${PARTY.entity}, a Wyoming limited liability company (“Hot Bot”, “we”, “us”) collects when you use usehotbot.com, the Hot Bot app and related tools (the “Platform”), and what we do with it. By using the Platform you agree to it.`],
  short: 'We collect what we need to run Hot Bot. We don’t sell your data or use it for ads. Blockchain activity is public and permanent.',
  sections: [
    { id: 'collect', title: '1. What we collect', blocks: [{ list: [
      '**What you give us:** wallet addresses, strategy settings, invite codes, and anything you send us, like an email address or social handle.',
      '**What you create:** trade records (tokens, amounts, prices, fees, transaction IDs) and payment records.',
      '**Technical data:** IP address, device, browser, approximate location, and how you use the Platform, collected through cookies and similar tools.',
      '**Public data:** Solana blockchain data, including activity from your wallets, and the results of any sanctions screening of wallet addresses.'] }] },
    { id: 'use', title: '2. How we use it', blocks: [
      'To run the Platform and place the trades you set up, process fees, provide support, keep things secure, prevent fraud and abuse, comply with the law, and improve the product.'] },
    { id: 'sharing', title: '3. Who we share it with', blocks: [
      `We don’t sell your data and don’t use it for targeted advertising. We share it only with service providers who help us run the Platform ${PARTY.providers}, when the law requires it or to protect our rights, in a sale or merger of the business, or with your permission. Trades you make are broadcast to the Solana network.`] },
    { id: 'chain', title: '4. Blockchain is public', blocks: [
      'Anyone can see your wallet’s transactions, and they can sometimes be linked to you. We can’t change or delete anything on the blockchain.'] },
    { id: 'retention', title: '5. How long we keep it', blocks: [
      'As long as your account is active, and after that as long as needed for legal, tax, security and dispute reasons. Then we delete it or remove what identifies you.'] },
    { id: 'security', title: '6. Security', blocks: [
      'We take reasonable steps to protect your data, but no system is fully secure and we can’t guarantee it. We will never ask for your private key or seed phrase.'] },
    { id: 'rights', title: '7. Your rights', blocks: [
      `Depending on where you live (including the EU, UK and some US states), you may have the right to access, correct, delete or get a copy of your data, object to or limit how we use it, and withdraw consent. Email ${PARTY.email} and we may ask you to verify yourself, for example by signing a message with your wallet. You can also complain to your local data protection authority. We don’t respond to “Do Not Track” signals.`] },
    { id: 'other', title: '8. Other things to know', blocks: [{ list: [
      'Your data may be processed in the United States and other countries.',
      'Hot Bot is not for anyone under 18. If we learn a minor has used it, we’ll delete their data.',
      'You can block cookies in your browser, but parts of the Platform may stop working.',
      'We may update this policy. Continuing to use the Platform means you accept the update.'] },
      `Questions: ${PARTY.email}`, `${PARTY.entity}, ${PARTY.address}`] },
  ],
};

/** The Go live step's risk notice and what a person declares there. Age and the Terms are accepted once, at first sign-in (`TERMS_DECLARES`). */
export const REAL_SOL = {
  title: 'Real SOL risk notice',
  points: [['You can lose all of it', 'Memecoins often go to zero within minutes. Scams, slippage, failed sales and outages can take all the SOL you put in.'],
    ['Agents, strategies and portfolios trade on their own', 'They buy and sell without asking you. A strategy can hold a coin with no price stop.'],
    ['Not financial advice', 'Nothing HOTBOT does is financial advice.'],
    ['Your wallet, your keys', KEY],
    ['Fees', `${pct(PLATFORM_FEE_BPS)} of the SOL in each buy and each sale, plus network fees.`],
    ['Withdrawals', `Your recovery email or wallet approves every withdrawal. New withdrawal addresses wait ${ADDRESS_LOCK_DAYS} days.`]] as [string, string][],
  declares: ['I can lose all the SOL I put in. HOTBOT’s agents trade on their own, and this is not financial advice.'],
} as const;
/** The Terms dialog's declarations. */
export const TERMS_DECLARES = ['I am 18 or older, and I accept the Terms and the Privacy policy.'] as const;

/** Each kind's current version and the exact text a consent to it covers. */
export const LEGAL: Record<LegalKind, { version: number; text: string }> = {
  terms: { version: 4, text: JSON.stringify({ terms: TERMS, privacy: PRIVACY, declares: TERMS_DECLARES }) },
  realSol: { version: 5, text: JSON.stringify(REAL_SOL) },
};

/** The text's SHA-256, hex. */
export async function legalHash(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** What a wallet-recovery person signs to accept Real SOL; Convex rebuilds it from its own facts and checks the signature over it. */
export const realSolMessage = (args: { userId: string; recovery: string; version: number; hash: string; nonce: string; at: string }) => [
  'usehotbot.com wants you to accept HOTBOT Real SOL.',
  `Account: ${args.userId}`, `Recovery: ${args.recovery}`, `Accepts: realSol version ${args.version}`, `Text hash: ${args.hash}`,
  `Declares: ${REAL_SOL.declares.join(' ')}`, `Nonce: ${args.nonce}`, `Issued: ${args.at}`].join('\n');
