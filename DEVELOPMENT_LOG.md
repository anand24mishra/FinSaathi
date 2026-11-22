# FinSaathi Development Log

How the project was built, in order, reconstructed from the repository's commit history (15 to 23 November 2026). It records what was built each day and the decisions visible in the history.

## Approach

1. **Define the data first.** A single shared contract (`shared/contract.ts`) describes every request and response, so the server and the app cannot drift apart.
2. **Build the server before the app.** Data sources, analysis and live feeds were made reliable first, so the app could be built against stable endpoints.
3. **Add intelligence in layers.** Deterministic rules first, then AI wording on top, with guardrails.
4. **Build the app screen by screen, then polish.**
5. **Fix real problems as they appeared** (see Decisions below).

## Timeline

| Date | Work |
|---|---|
| 15 Nov | Workspace set up, shared API contract, Fastify + TypeScript server scaffold |
| 16 Nov | MongoDB/crypto helpers, accounts and security, stock universe, NSE quote provider, Yahoo Finance and currency feeds, first live-quote broker integration |
| 17 Nov | Mutual funds (MFAPI), news and social sources, technical indicators, sentiment, Buffett and Jhunjhunwala analysis lenses, the calls engine that combines them |
| 18 Nov | Market service and cache layer, WebSocket server for live prices |
| 19 Nov | Portfolio and goal planner, education content, alerts and Telegram bot, LLM wrapper with guardrails, daily analyst agent, API routes. Mobile app started: Expo config, design tokens, theme |
| 20 Nov | UI components, charts, typed API client and data hooks, Hindi/English localization |
| 21 Nov | App state and live-price subscription, navigation, welcome and sign-in, Markets, stock and fund detail, portfolio and planning screens |
| 22 Nov | Assistant, learn and alerts screens; Android fixes; switch of live source; keep-alive for free hosting; MongoDB storage and Google sign-in; Telegram news channels; Screener.in fundamentals; voice chat, saved chats, IPO guide |
| 23 Nov | Animated landing page, simpler home and chat, redesigned analyst lenses, Hindi replies for how-to questions, iPhone support |

## Decisions and changes of direction

- **Backend instead of calling data sites from the app.** Keeps API keys off the phone, lets one fetch serve all users, and allows fallbacks.
- **Live data source changed.** A Dhan integration was added on 16 Nov, then replaced on 22 Nov by Angel One, which logs itself in with a generated one-time code and refreshes every 6 hours, so no token needs copying by hand. Live quotes are shared across users instead of fetched per user.
- **Storage moved to MongoDB.** The free host wipes its disk on every restart, so accounts and portfolios needed an external database.
- **Free-hosting sleep.** Added a self-ping plus a scheduled GitHub Action to keep the service awake.
- **Fundamentals source.** Screener.in is tried first with Yahoo as fallback, and the app labels which site actually supplied the data.
- **Rules before AI.** Stock verdicts come from deterministic scoring, so they can be explained. The AI only rewrites text, and its output is rejected if it contains promotional phrases or numbers not in the evidence.
- **Sign-in made mandatory,** replacing anonymous guest use; old guest accounts are still handled.
- **A feature was removed** (the share-tip feature) after it did not fit the product.
- **Platform fixes.** An Android dependency patch, a release-signing plugin, and later iPhone fixes (WAV voice recording, read-aloud in silent mode, keyboard hiding the nav bar).
- **UI iterations.** The analyst lens display was redesigned twice, first with score rings and icons, then into compact rows with plain-language titles.

## Testing

Unit and end-to-end tests (Vitest) cover language detection, account flows, the Angel One provider, the screener parser, news channels and the keep-alive logic.
