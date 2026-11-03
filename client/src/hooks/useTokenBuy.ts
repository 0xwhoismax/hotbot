"use client";
import { useEffect, useState } from 'react';
import { BLOCKED_COUNTRIES } from '../../../types/legal';

let request: Promise<string | null> | null = null;
/** The visitor's country code as Cloudflare's edge answers /cdn-cgi/trace, so the pages that offer a buy stay static files that no Worker
 *  renders; null where no edge answers (development) or the request fails. */
const countryOf = () => request ??= fetch('/cdn-cgi/trace')
  .then(response => response.ok ? response.text() : '')
  .then(trace => /^loc=(\w+)$/m.exec(trace)?.[1] ?? null)
  .catch(() => null);

/** The visitor's country code (null when unknown), or undefined until it is known. */
export function useCountry() {
  const [country, setCountry] = useState<{ code: string | null }>();
  useEffect(() => {
    let active = true;
    void countryOf().then(code => { if (active) setCountry({ code }); });
    return () => { active = false; };
  }, []);
  return country;
}

/** UK law bars an unauthorised firm from inviting people in the UK to buy a cryptoasset, so they get no buy link. An unknown location counts as the UK, and so does every visitor until the country is known. */
export function useTokenBuy() {
  const country = useCountry();
  return Boolean(country?.code && !BLOCKED_COUNTRIES.has(country.code));
}
