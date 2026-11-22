import { describe, expect, it } from 'vitest';
import { classify, telegramToNews } from './newsChannels';
import { parseChannelHtml } from './providers/telegram';
import { cleanSummary } from './providers/rssFeeds';
import { getIpoGuide, ipoGuideText } from './ipoGuide';

describe('classify', () => {
  it('routes headlines to channels', () => {
    expect(classify('Acme IPO opens on Monday, price band set')).toBe('ipo');
    expect(classify('SIP inflows hit record, mutual fund AUM rises')).toBe('funds');
    expect(classify('Gold prices hit fresh high')).toBe('gold');
    expect(classify('RBI keeps repo rate unchanged')).toBe('economy');
    expect(classify('Infosys shares jump after Q2 results')).toBe('stocks');
    expect(classify('Sensex ends flat in volatile session')).toBe('markets');
  });
});

const html = (text: string) => `<div class="tgme_channel_info_header_title"><span dir="auto">Mint</span></div><div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="livemint/123"><div class="tgme_widget_message_text js-message_text" dir="auto">${text}</div><span class="tgme_widget_message_views">1.2K</span><time datetime="2026-11-21T10:00:00+00:00"></time></div></div>`;

describe('telegramToNews', () => {
  it('shows the publisher, keeps the full text and has no outbound link', () => {
    const body = 'Sensex rises 300 points as banks rally.<br/>Nifty Bank hits a record high on strong credit growth data.';
    const p = parseChannelHtml(html(body), 'livemint').posts[0];
    const n = telegramToNews(p);
    expect(n.source).toBe('Mint');
    expect(n.url).toBe('');
    expect(n.title).toContain('Sensex rises 300 points');
    expect(n.body).toContain('Nifty Bank hits a record high');
    expect(JSON.stringify(n)).not.toMatch(/t\.me|telegram/i);
  });
});

describe('cleanSummary', () => {
  it('strips HTML and drops summaries that repeat the title', () => {
    expect(cleanSummary('<p>Banks &amp; NBFCs led gains as FIIs turned buyers after weeks of selling.</p>', 'Markets rally')).toBe('Banks & NBFCs led gains as FIIs turned buyers after weeks of selling.');
    expect(cleanSummary('Markets rally on FII buying', 'Markets rally on FII buying')).toBeUndefined();
  });
});

describe('IPO guide', () => {
  it('has every section in both languages with matching structure', () => {
    const en = getIpoGuide('en'), hi = getIpoGuide('hi');
    expect(en.sections.map((s) => s.id)).toEqual(hi.sections.map((s) => s.id));
    expect(en.sections.length).toBeGreaterThanOrEqual(6);
    for (const [a, b] of en.sections.map((s, i) => [s, hi.sections[i]] as const)) { expect(a.steps.length).toBe(b.steps.length); expect(/[ऀ-ॿ]/.test(b.title)).toBe(true); }
  });
  it('chat text can target a section', () => { expect(ipoGuideText('en', 'apply')).toMatch(/demat/); });
});
