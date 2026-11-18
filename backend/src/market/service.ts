// Public facade of the market module. Signatures are used by core (alerts, planner, portfolio) — keep them stable.
export { getQuotes, getSeries, listStocks, getStockDetail, getAnalysis, getDailyIdeas, stockMeta, DataError } from './data';
export { getMarketOverview } from './overview';
export { getNews } from './news';
export { getIpoFeed } from './ipo';
export { searchFunds, getFundDetail, runSipSim } from './funds';
export { getAlternatives } from './alternatives';
export { getBriefing } from './briefing';
