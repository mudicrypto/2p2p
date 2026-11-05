/**
 * Off-platform chat filter (spec 6). Blocks messages that push users off-platform:
 * phone numbers, Telegram/WhatsApp handles and links, "pay outside" phrasing (multi-language).
 */
const PATTERNS: Array<[string, RegExp]> = [
  ['phone', /(?:\+|00)?\d[\d\s().-]{8,}\d/],
  ['telegram', /(?:t\.me\/|telegram\.me\/|tg:\/\/|@[a-z0-9_]{5,32}\b)/i],
  ['messenger', /\b(?:whats\s?app|wa\.me|signal|viber|wechat|line\s?id|skype|discord)\b/i],
  ['email', /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i],
  ['link', /\bhttps?:\/\/(?!localhost)\S+/i],
  ['off_platform', /\b(?:pay|deal|trade|talk|contact)\s+(?:me\s+)?(?:outside|off|directly|privately)\b|\boutside (?:the )?(?:platform|app|escrow)\b|\bwithout escrow\b|вне (?:платформы|биржи)|напиши (?:мне )?в (?:телеграм|тг|личку)|fuera de la plataforma|por fora|fora da plataforma/i],
];
export interface FilterResult { blocked: boolean; reasons: string[] }
export function filterChat(body: string): FilterResult {
  // Normalize common obfuscations: "t . me", zero-width chars, fullwidth digits.
  const norm = body.normalize('NFKC').replace(/[​-‍﻿]/g, '').replace(/\s*\.\s*(me|com|org|io)\b/gi, '.$1');
  const reasons = PATTERNS.filter(([, re]) => re.test(norm)).map(([k]) => k);
  return { blocked: reasons.length > 0, reasons };
}
