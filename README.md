# Hot Bot

Your own AI trading team for Solana memecoins. Live at [usehotbot.com](https://usehotbot.com/).

Built by Elijah Paul ([@elijahintek](https://x.com/elijahintek)) and Max Skutin ([@0xWhoismax](https://x.com/0xWhoismax)).

You describe a strategy in plain words. A team of agents finds coins, checks them for scams, buys and manages the exits, every second of the day:

- **ResearchBot** checks every new launch against your strategy and scores it (around 1,000 concurrent checks per strategy, per second).
- **ShieldBot** blocks rugs and scams from the coin's first block, flagging 92%+ of rugs across 50,000+ new tokens every day.
- **SniperBot** picks the entry.
- **TraderBot** buys in under 50 ms (fastest 25 ms) and manages each exit live.
- **Hot Bot** is the orchestrator you talk to.

You build and change strategies by chat: Hot Bot drafts the rules, and you apply each change with one tap. Strategies run on paper first, with the practice version still running beside your Real SOL copy once you go live. Portfolios hold a themed basket of coins managed by your team. You can also connect your own AI (Claude, ChatGPT, Cursor, Antigravity, Gemini CLI, Muse) through our MCP server.

## Live on Mainnet (Since Oct 26, 2026)

- 230+ paying traders in private beta, with 2,000+ on the waitlist
- Around 4,500 SOL ($425K) in Real SOL volume across 12,441 closed trades from 42 teams since Oct 27
- 6,155 strategies set up, 94 Portfolios running, and 100 users connected with their own AI agent
- 2,816 commits pushed since Sep 28 across our main repo

## How it works

- **Our own Solana indexer (Rust)** reads the validator stream directly and decodes the launchpads and AMMs coins trade on. Each coin's live state is less than 50 ms behind the chain, and swaps land on chain in under 50 ms (fastest 25 ms).
- **Scam protection from block 0** reads authorities, transfer fees, launch origin, deployer history and early-buyer wallets before any buy. When one team catches a rugger, every team is protected.
- **A real-time strategy engine** checks every rule and every exit from your buy price in code on each price update. The agents decide on top of this protective floor and can never loosen it.
- **Our own ML models** are trained on our on-chain dataset of every launch and power RSISS one-click strategy improvements.
- **Solana throughout:** sign-in with a Solana wallet, swaps sent from each user's own wallet, and models trained on replays of the full block archive.

## This repository

This is the web client: Next.js, React and Convex. Our main repo (2,816 commits since Sep 28 across the backend, the MCP server, the Rust indexer, the models, the website's server routes and the production thresholds) stays private to protect live traders and keep scam deployers from gaming our filters.

| Path | What |
| :--- | :--- |
| `client/src/components/team` | The team app: home, strategies, settings, the Lab, the chat with Hot Bot, the wallet and Your agents |
| `client/src/components/hotbot` | The Hot Bot characters and the landing page |
| `client/convex/api.ts` | The backend functions that the client calls, with their arguments and results |
| `types/` | The contracts that the client and the backend share. Every scam and research check is listed with its label and target. A `PRIVATE` value is a placeholder for a production number |

The client needs the Hot Bot backend to run. To read and type-check it: `bun install && bun run typecheck`.

## Use Hot Bot from your own AI (MCP)

Claude, ChatGPT, Cursor, Antigravity, Gemini CLI, Codex and [Muse](https://www.meta.com/help/artificial-intelligence/1687253048996149/) connect to Hot Bot as a remote MCP server. Your AI reads your team, rates coins, explains why a strategy wins or loses, and previews a change before you apply it.

Add a custom MCP connector with:

```text
Name: Hot Bot
Transport: remote streamable HTTP
URL: https://api.usehotbot.com/mcp
Auth: OAuth
```

Sign in, check the app and its address, and tap **Allow**. The connection only reads until you turn on **Can trade**. You see each connected agent on the Account page under **Your agents**, and you delete it there to cut it off at once.

### Tools

| Tool | Kind | What it does |
| :--- | :--- | :--- |
| `get_team`, `get_stats`, `get_activity`, `get_funnel`, `get_trades`, `get_decisions` | Read | The team, each strategy's results, its funnel, its sales and the bots' decisions |
| `get_coin`, `search_coins` | Read | One coin as the team sees it, or a search by mint or symbol |
| `get_reference` | Read | Every setting a strategy takes, with its unit and range, and the exit plans |
| `list_portfolios`, `get_portfolio` | Read | Themed portfolios and their journals |
| `rate_coin` | Write | Marks a coin as Would trade, Scam or Not for me, and leaves a note on why |
| `update_strategy` | Write | Changes a strategy's settings. `preview` checks the change and saves nothing |
| `create_strategy`, `strategy_action` | Write | Makes a strategy, or pauses, runs or archives one |
| `draft_portfolio`, `start_portfolio`, `portfolio_action`, `set_portfolio_limits`, `answer_portfolio_ask` | Write | Drafts, starts and manages themed portfolios on paper |
| `coin_action` | Sensitive write | Approves, buys or sells one coin |
| `team_action` | Sensitive write | Sells every coin, stops or resumes every strategy, or resets practice |

Every write needs a connection with **Can trade** on. Sign-in is OAuth 2.1 with PKCE, and Hot Bot stores only a hash of each token.

## License

Copyright Hot Bot LLC. All rights reserved. You can read this code. You cannot copy, change or redistribute it.

Disclaimer: Nothing here is financial advice. Memecoin trading is extremely risky and you can lose everything you put in. Hot Bot automates your Strategy; it does not guarantee profits.
