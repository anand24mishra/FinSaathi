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

