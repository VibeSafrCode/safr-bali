/** Trusted, static customer copy only. Never apply to an API response, a person,
 * referral, message, identifier, URL, or canonical source file. Main is a no-op.
 * Apply before variable interpolation and AFTER existing commercial-content cuts.
 */
export const YOGA_PRESENTATION_REVISION = 'yoga-white-label-2026-10-15';
export const YOGA_DISPLAY_NAME = 'Yoga Ganster';

export function yogaPresentationText(value, yoga = true) {
  if (!yoga || typeof value !== 'string') return value;
  // Addresses and interpolation tokens are opaque, even when they contain a brand.
  return value.split(/(https?:\/\/[^\s<>]+|mailto:[^\s<>]+|\{[A-Za-z][A-Za-z0-9_]*\}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/gi)
    .map(part => /^(?:https?:\/\/|mailto:|\{)|^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/i.test(part) ? part
      : part.replace(/\bSAFR(?:WAY)?\s+Points\b/gi, 'Points')
        .replace(/\bSAFR\s+Bali\b|\bSAFRWAY\b|\bSAFR\b/gi, YOGA_DISPLAY_NAME))
    .join('');
}
