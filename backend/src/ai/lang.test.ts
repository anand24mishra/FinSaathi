import { describe, expect, it } from 'vitest';
import { detectStyle, styleToLang } from './lang';

describe('detectStyle', () => {
  it('Devanagari is Hindi', () => { expect(detectStyle('आज बाज़ार कैसा है')).toBe('hi'); expect(detectStyle('रिलायंस का भाव क्या है?')).toBe('hi'); });
  it('Roman Hindi is Hinglish', () => {
    expect(detectStyle('Reliance ka price kya hai')).toBe('hinglish');
    expect(detectStyle('mujhe IPO me apply kaise karna hai')).toBe('hinglish');
    expect(detectStyle('aaj market kaisa hai')).toBe('hinglish');
  });
  it('English stays English', () => {
    expect(detectStyle('What is the Nifty today?')).toBe('en');
    expect(detectStyle('How do I apply for an IPO')).toBe('en');
    expect(detectStyle('Show my portfolio')).toBe('en');
    expect(detectStyle('My boss told me to buy a share, how do I check it')).toBe('en');
    expect(detectStyle('Show me the share price to buy')).toBe('en');
  });
  it('Hindi words mixed into Devanagari still Hindi; digits only is English', () => {
    expect(detectStyle('TCS का share कैसा है')).toBe('hi');
    expect(detectStyle('12345')).toBe('en');
  });
  it('maps to canned-text language', () => { expect(styleToLang('hi')).toBe('hi'); expect(styleToLang('hinglish')).toBe('en'); expect(styleToLang('en')).toBe('en'); });
});

import { plain } from './assistant';
describe('plain', () => {
  it('removes markdown the app cannot render', () => {
    expect(plain('**Demat:** ek account\n* item one\n- item two\n## Heading')).toBe('Demat: ek account\n• item one\n• item two\nHeading');
  });
});

import { isTip, tipChecklist } from './tipCheck';
import { norm } from './assistant';
describe('tip check', () => {
  it('spots "someone told me to buy"', () => {
    for (const m of ['My boss told me to buy Reliance', 'boss ne bola TCS le lo', 'मेरे बॉस ने कहा है कि यह शेयर खरीदो', 'friend ne tip diya hai kharidna chahiye', 'broker suggests I invest in Infosys']) expect(isTip(norm(m))).toBe(true);
  });
  it('ignores ordinary questions', () => {
    for (const m of ['What is the price of Reliance', 'Should I buy TCS', 'आज बाज़ार कैसा है', 'explain SIP']) expect(isTip(norm(m))).toBe(false);
  });
  it('has the same 5 checks in every language', () => {
    for (const s of ['en', 'hi', 'hinglish'] as const) expect(tipChecklist(s, 'TCS').split('\n').filter((l) => /^[1-5]\. /.test(l)).length).toBe(5);
  });
});
