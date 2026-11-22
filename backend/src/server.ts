import { buildApp } from './app';
import { deliverCandidates, startAlertScheduler, stopAlertScheduler } from './core/alerts';
import { startAnalystScheduler, stopAnalystScheduler } from './agent/analyst';
import { getProfile, listRecentlyActiveUserIds } from './core/users';
import { startTelegramBot, stopTelegramBot } from './core/telegramBot';
import { startAngelSession, stopAngelSession } from './market/providers/angel';
import { startKeepAlive, stopKeepAlive } from './core/keepAlive';
import { config } from './config';
import { closeDb } from './db';

const app = await buildApp();
startAlertScheduler();
startTelegramBot(app.log); // only when TELEGRAM_BOT_TOKEN is set (and TELEGRAM_ENABLED / SCHEDULER_ENABLED allow)
startKeepAlive(); // Render free tier sleeps after 15 min idle: ping our own public URL every 10 min
startAngelSession(); // Angel One logs itself in with a generated TOTP and re-logs in every 6h: no token to paste or redeploy
startAnalystScheduler(async (candidatesFor) => {
  const since = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
  for (const id of listRecentlyActiveUserIds(since)) await deliverCandidates(id, candidatesFor(getProfile(id).language));
}, config.schedulerEnabled);

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  app.log.info(`${signal} received, shutting down`);
  const force = setTimeout(() => process.exit(1), 8000);
  force.unref();
  try { stopAlertScheduler(); stopAnalystScheduler(); stopAngelSession(); stopKeepAlive(); await stopTelegramBot(); await app.close(); closeDb(); } catch (e) { app.log.error(e); }
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (e) => app.log.error({ err: e instanceof Error ? e.message : String(e) }, 'unhandledRejection'));

await app.listen({ port: config.port, host: config.host });
