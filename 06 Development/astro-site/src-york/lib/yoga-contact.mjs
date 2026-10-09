import registry from '../../../shared/content/service-registry.v1.json' with {type:'json'};
import {previewSourceRoute} from '../../../shared/src/preview-brand.mjs';

// Read existing identities even when a legacy page has no public Registry model.
// This is attribution only: it cannot publish a draft or grant account rights.
export function yogaTopicForRoute(route) {
  if (typeof route !== 'string') return 'general';
  const source = previewSourceRoute(route);
  const matches = registry.records.filter(record => record.candidate.route === source);
  if (matches.length > 1) throw new Error('Ambiguous Yoga topic route');
  return matches[0]?.contentId ?? 'general';
}

// Explicit operator build selection, not query/Host/referrer-controlled origin.
const mode = process.env.YOGA_CONTACT_MODE ?? 'demo';
if (!['demo','telegram'].includes(mode)) throw new Error('Invalid Yoga contact build mode');
export const yogaTelegramContacts = mode === 'telegram';
export function yogaContactHref(contentId = 'general') {
  if (!yogaTelegramContacts) return null;
  if (typeof contentId !== 'string' || !/^[a-z][a-z0-9_]{0,59}$/.test(contentId))
    throw new Error('Invalid Yoga topic identity');
  // /start identifies a question only. It never grants account/partner rights.
  return 'https://t.me/Yoga_ganster_bot?start=svc_' + contentId;
}
