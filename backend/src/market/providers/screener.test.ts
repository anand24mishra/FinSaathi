import { describe, it, expect } from 'vitest';
import { parseScreener } from './screener';

const row = (label: string, ...v: string[]) => `<tr><td class="text">${label}</td>${v.map((x) => `<td>${x}</td>`).join('')}</tr>`;
const page = (broad = 'Information Technology') => `
<ul id="top-ratios">
 <li><span class="name">Market Cap</span><span class="nowrap value">₹ <span class="number">8,59,730</span> Cr.</span></li>
 <li><span class="name">Current Price</span><span class="nowrap value">₹ <span class="number">2,376</span></span></li>
 <li><span class="name">Stock P/E</span><span class="nowrap value"><span class="number">15.7</span></span></li>
 <li><span class="name">Book Value</span><span class="nowrap value">₹ <span class="number">329</span></span></li>
 <li><span class="name">Dividend Yield</span><span class="nowrap value"><span class="number">2.69</span> %</span></li>
 <li><span class="name">ROE</span><span class="nowrap value"><span class="number">51.8</span> %</span></li>
</ul>
<a href="/market/IN08/" title="Broad Sector">${broad}</a><a href="/x" title="Industry">Computers - Software &amp; Consulting</a>
<section id="profit-loss"><table>${row('Sales&nbsp;+', '267,021', '283,248')}${row('Sales growth', '+5%', '+10%')}${row('Net Profit&nbsp;+', '49,454', '51,858')}${row('EPS in Rs', '136.01', '142.64')}</table></section>
<section id="balance-sheet"><table>${row('Equity Capital', '362', '362')}${row('Reserves', '106,878', '118,624')}${row('Borrowings&nbsp;+', '11,283', '11,808')}</table></section>`;

describe('parseScreener', () => {
  it('maps ratios, margins and debt/equity', () => {
    const f = parseScreener(page());
    expect(f.marketCapCr).toBe(859730); expect(f.pe).toBe(15.7); expect(f.roePct).toBe(51.8); expect(f.dividendYieldPct).toBe(2.69);
    expect(f.pb).toBe(7.22); expect(f.epsTtm).toBe(142.64); expect(f.revenueGrowthPct).toBe(10);
    expect(f.profitMarginPct).toBe(18.31); expect(f.debtToEquity).toBe(0.1);
    expect(f.sector).toBe('Information Technology'); expect(f.industry).toBe('Computers - Software & Consulting');
  });
  it('leaves debt/equity empty for financial companies', () => { expect(parseScreener(page('Financial Services')).debtToEquity).toBeNull(); });
  it('rejects a page with no data', () => { expect(() => parseScreener('<html>blocked</html>')).toThrow(); });
});
