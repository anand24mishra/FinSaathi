# FinSaathi

A bilingual (Hindi and English) mobile app and backend for Indian retail investors. It brings together NSE market data, stock research, portfolio tracking, mutual funds, IPOs, news and price alerts in one place.

## Features

- **Markets**: Nifty 50, Sensex and Bank Nifty, top gainers and losers, FII/DII flows, IPO listings and mutual fund NAVs.
- **Stock research**: price charts, fundamentals, and two rule-based analysis styles (long-term quality and growth momentum).
- **Portfolio**: holdings, profit and loss, sector allocation and diversification checks.
- **Alerts**: price and news alerts delivered as push notifications and through a Telegram bot.
- **Assistant**: question-and-answer help on markets and personal finance, with an educational disclaimer on every answer.
- **Learn**: short lessons on common investing concepts.
- **Hindi and English**: the interface, news summaries and glossary are available in both languages.

## Market data sources

| Data | Source |
|---|---|
| Live NSE quotes and indices | Angel One SmartAPI (free), refreshed about every 5 seconds and shared across users |
| Wider stock universe | NSE India website |
| Charts and fundamentals | Yahoo Finance |
| Mutual funds | MFAPI |
| Currency | Frankfurter |
| News | Publisher RSS feeds |

The backend signs in to Angel One by itself using a time-based one-time password, so no access token needs to be copied or refreshed by hand. If a source is unavailable, the backend falls back to the next one.

## Repository layout

```
backend/    Fastify + TypeScript API and WebSocket server
  src/core/     authentication, portfolio, alerts, Telegram bot, SQLite storage
  src/market/   data providers and analysis
  src/ai/       assistant integration and guardrails
mobile/     Expo (React Native) application
  app/          file-based routes
  src/          API client, components, features, translations, live-quote client
shared/     TypeScript types shared by backend and mobile
start.sh    starts the backend and the Expo dev server
```

## Tech stack

- **Mobile**: Expo SDK 58, React Native 0.88, Expo Router, NativeWind, Reanimated
- **Backend**: Node.js, TypeScript, Fastify, WebSocket, SQLite
- **Testing**: Vitest

## Getting started

Requirements: Node.js 20 or later, npm 10 or later, and the Expo Go app or an emulator.

```bash
git clone https://github.com/anand24mishra/FinSaathi.git
cd FinSaathi

cp backend/.env.example backend/.env
cp mobile/.env.example mobile/.env

cd backend && npm install
cd ../mobile && npm install
cd ..

./start.sh
```

The API listens on `http://localhost:4000` and the Expo dev server on `http://localhost:8081`.

### Configuration

All settings are environment variables in `backend/.env` and all are optional (`JWT_SECRET` is generated on first run). Without the market-data variables the backend serves data from the NSE website and Yahoo Finance.

| Variable | Purpose |
|---|---|
| `ANGEL_API_KEY`, `ANGEL_CLIENT_CODE`, `ANGEL_PIN`, `ANGEL_TOTP_SECRET` | Angel One SmartAPI live quotes. Create an app at smartapi.angelone.in and enable TOTP to get these. |
| `GEMINI_API_KEY` or `ANTHROPIC_API_KEY` | Enables the assistant |
| `TELEGRAM_BOT_TOKEN` | Enables the Telegram alert bot |
| `KEEPALIVE`, `KEEPALIVE_HOURS_IST` | Self-ping settings for free hosting (see below) |

## Deployment on Render (free tier)

Render free web services sleep after 15 minutes without incoming requests. Two free mechanisms keep the service awake:

- `backend/src/core/keepAlive.ts` requests the service's own `/v1/health` every 10 minutes. It uses the `RENDER_EXTERNAL_URL` variable that Render sets automatically. Set `KEEPALIVE=off` to disable it, or `KEEPALIVE_HOURS_IST=06-24` to allow sleeping overnight.
- `.github/workflows/keep-alive.yml` makes the same request every 10 minutes from GitHub Actions, which is free for public repositories and can also wake a sleeping service.

Free instance hours are 750 per month for the whole Render workspace. One always-on service uses at most 744, so keep it the only free service in that workspace.

## Disclaimer

FinSaathi is for education and research. Nothing in the app is investment advice, and it is not a SEBI-registered advisory service. Market data may be delayed or incomplete.
