import { getLocales } from 'expo-localization';
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

function envDefaultRegion(): CountryCode | null {
  const v = process.env.EXPO_PUBLIC_DEFAULT_PHONE_REGION?.trim().toUpperCase();
  if (v && /^[A-Z]{2}$/.test(v)) return v as CountryCode;
  return null;
}

export function getDefaultPhoneRegion(): CountryCode {
  const fromEnv = envDefaultRegion();
  if (fromEnv) return fromEnv;
  const device = getLocales()[0]?.regionCode?.toUpperCase();
  if (device && /^[A-Z]{2}$/.test(device)) return device as CountryCode;
  return 'US';
}

/** Parse a single number to E.164, or null if invalid / empty. */
export function normalizeToE164(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const region = getDefaultPhoneRegion();
  const parsed = parsePhoneNumberFromString(trimmed, region);
  if (!parsed?.isValid()) return null;
  return parsed.format('E.164');
}

/** Dedupe; preserves first-seen order. */
export function normalizePhoneNumbers(rawNumbers: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of rawNumbers) {
    const e164 = normalizeToE164(raw);
    if (!e164 || seen.has(e164)) continue;
    seen.add(e164);
    out.push(e164);
  }
  return out;
}
