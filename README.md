# FinSaathi · फ़िनसाथी 🇮🇳📈

> **AI-Powered Indian Market Intelligence & Financial Companion**
> Real-time NSE/BSE data, intelligent investment personas, bilingual (Hindi & English) insights, portfolio tracking, and instant alerts.

---

## ✨ Overview

**FinSaathi** is a modern, bilingual financial companion engineered specifically for Indian retail investors. Bridging the gap between raw financial metrics and actionable investor intelligence, FinSaathi combines real-time market data across equities, mutual funds, and IPOs with persona-driven AI analysis modeled after legendary investment philosophies (Warren Buffett and Rakesh Jhunjhunwala).

### 🚀 Key Highlights

- **Bilingual Interface**: Seamless Hindi and English localization across all financial terms, news summaries, and AI conversations.
- **Multi-Source Market Feeds**: Integration with NSE Live, Angel One SmartAPI (free, 5s cache), Yahoo Finance, MFAPI (Mutual Funds), and Frankfurter currency feeds.
- **Legend Persona Analysis**: Dual-perspective fundamental and momentum evaluation:
  - **Buffett Style**: Moat evaluation, free cash flow consistency, ROE/ROCE compounding, debt coverage, and margin of safety.
  - **Jhunjhunwala Style**: Growth momentum, sector tailwinds, Capex cycles, and high operating leverage.
- **Smart Portfolio Management**: Real-time asset allocation, risk distribution, gain/loss metrics, and diversification scoring.
- **Live WebSocket Feeds**: Sub-second ticker broadcasts for Nifty 50, Bank Nifty, top gainers, and top losers.
- **Omni-Channel Alerts**: Configurable price thresholds and breaking market news sent directly via push notifications and Telegram bot.

---

## 🏗️ Architecture

```
fin-saathi/
├── backend/                  # Fastify + TypeScript server
│   ├── src/
│   │   ├── agent/            # Autonomous research & market analyst agents
│   │   ├── ai/               # LLM integration, guardrails & narration
│   │   ├── core/             # Auth, portfolio, alerts, Telegram bot & SQLite DB
│   │   ├── market/           # Providers (Angel One, NSE, Yahoo, MFAPI, RSS), analysis engine
│   │   └── server.ts         # Fastify HTTP & WebSocket server entrypoint
│   └── package.json
├── mobile/                   # Expo React Native mobile application
│   ├── app/                  # Expo Router file-based navigation
│   ├── src/
│   │   ├── api/              # Strongly typed API client & contract hooks
│   │   ├── components/       # Design system UI components (cards, charts, buttons)
│   │   ├── features/         # Markets, Stock Details, Portfolio, Ask AI, Learn
│   │   ├── i18n/             # English/Hindi translations & financial glossary
│   │   ├── live/             # WebSocket live feed subscriber & ticker hooks
│   │   └── theme/            # Semantic tokenized color & typography system
│   └── package.json
├── shared/                   # Shared TypeScript contracts & schemas
│   └── contract.ts
└── start.sh                  # One-click startup script (API + Metro dev server)
```

---

## 🛠️ Tech Stack

### Mobile Client
- **Framework**: [Expo SDK 58](https://expo.dev/) with [React Native 0.88](https://reactnative.dev/)
- **Navigation**: [Expo Router](https://docs.expo.dev/router/introduction/) (File-based routing)
- **Styling**: [NativeWind v5](https://www.nativewind.dev/) (Tailwind CSS v4 engine) with semantic design tokens
- **Icons**: [Lucide React Native](https://lucide.dev/)
- **Animation**: [React Native Reanimated](https://docs.swmansion.com/react-native-reanimated/) & [Legend Motion](https://legendapp.com/open-source/motion/)
- **Storage**: [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/) & AsyncStorage

### Backend Service
- **Runtime**: [Node.js](https://nodejs.org/) (ES Modules) with [TypeScript](https://www.typescriptlang.org/)
- **Web Framework**: [Fastify](https://fastify.dev/) with HTTP/2 and WebSocket support
- **Market Data**: Angel One SmartAPI, NSE India Scraping/Live, Yahoo Finance API, MFAPI
- **AI Engine**: Anthropic Claude API / LLM abstraction layer with strict financial advice guardrails
- **Database**: Embedded SQLite with AES-256 encrypted credentials
- **Bot Engine**: Telegram Bot API for real-time portfolio threshold alerts

---

## ⚡ Getting Started

### Prerequisites

- **Node.js** >= 20.x
- **npm** >= 10.x
- **Expo Go** on your physical iOS or Android device (or an emulator/simulator)

### Quick Start

1. **Clone the repository:**
   ```bash
   git clone https://github.com/anand24mishra/FinSaathi.git
   cd FinSaathi
   ```

2. **Configure environment variables:**
   ```bash
   cp backend/.env.example backend/.env
   cp mobile/.env.example mobile/.env
   ```
   *(Add your Angel One credentials (ANGEL_API_KEY, ANGEL_CLIENT_CODE, ANGEL_PIN, ANGEL_TOTP_SECRET), Anthropic API key, or Telegram Bot Token if live external integrations are needed; dummy/cached fallbacks work out of the box).*

3. **Install dependencies:**
   ```bash
   cd backend && npm install
   cd ../mobile && npm install
   cd ..
   ```

4. **Start both Backend and Mobile:**
   ```bash
   chmod +x start.sh
   ./start.sh
   ```
   - Backend API: `http://localhost:4000`
   - Metro Dev Server: `http://localhost:8081`

---

## 📱 Mobile App Screens

- **Markets**: Real-time Nifty 50, Sensex, Sector indices, FII/DII data, Gainers/Losers, IPO calendar, and Mutual Fund NAVs.
- **Stock Analysis**: Candlestick/line charts, technical indicators (RSI, MACD, Moving Averages), and Buffett vs. Jhunjhunwala scorecards.
- **Ask FinSaathi**: Interactive conversational financial assistant with voice support and Hinglish/Hindi fluency.
- **Portfolio & Risk**: Live P&L, sector allocation pie charts, beta risk score, and automated dividend tracking.
- **Learn Hub**: Interactive modules explaining P/E ratio, market cap, compounding, mutual fund categories, and derivatives basics.

---

## 🔒 Security & Guardrails

FinSaathi implements strict financial compliance guardrails:
- **Disclaimer Enforcement**: Every AI analysis includes a disclaimer clarifying that outputs are for educational research and not SEBI-registered investment advice.
- **Data Protection**: User broker tokens and portfolio balances are stored encrypted locally and never transmitted unhashed.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
