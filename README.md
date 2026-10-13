# HOTBOT

**Your own AI trading team for Solana memecoins.** Live at [usehotbot.com](https://usehotbot.com).

You describe a strategy in plain words. A team of agents finds coins, checks them for scams, buys and manages the exits, every second of the day:

- **ResearchBot** checks every new launch against your strategy and scores it.
- **ShieldBot** blocks rugs and scams, from the coin's first block.
- **SniperBot** picks the entry.
- **TraderBot** buys and manages each exit live.
- **HOTBOT** is the orchestrator you talk to.

You build and change strategies by chat: the AI drafts the rules, and you apply each change with one tap. Strategies run on paper first and move to real SOL when you choose. Portfolios hold a themed basket of coins, managed by an agent. You can also connect your own AI (Claude, ChatGPT, Cursor) through our MCP server.

## How it works

- **Our own Solana indexer (Rust)** reads the validator stream directly and decodes 12 venues: pump.fun, PumpSwap, Raydium, Meteora, Orca and others. Each coin's live state is less than 50 ms behind the chain.
- **Scam protection from block 0** reads authorities, transfer fees, launch origin, deployer history and early-buyer wallets before any buy. When one team catches a rugger, every team is protected.
- **A real-time strategy engine** checks every rule and every exit in code on each price update. The agents decide on top of this protective floor and can never loosen it.
- **Our own ML models** are trained on our on-chain dataset of every launch.
- **Solana throughout:** sign-in with a Solana wallet, swaps sent from each user's own wallet, and models trained on replays of the full block archive.

## This repository

This is the web client: Next.js, React and Convex. The backend, the indexer, the models and the production thresholds are private.

| Path | What |
|---|---|
| `client/src/components/team` | The team app: home, strategies, settings, the Lab, the chat with HOTBOT and the wallet |
| `client/src/components/hotbot` | The HOTBOT characters and the landing page |
| `client/convex/api.ts` | The backend functions that the client calls |
| `types/` | The contracts that the client and the backend share. Every scam and research check is listed with its label and target. A `PRIVATE` value is a placeholder for a production number. |

The client needs the HOTBOT backend to run. To read and type-check it: `bun install && bun run typecheck`.

## License

Copyright HOTBOT. All rights reserved. You can read this code. You cannot copy, change or redistribute it.
