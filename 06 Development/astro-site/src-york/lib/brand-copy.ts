import { previewSourceRoute } from '../../../shared/src/preview-brand.mjs';
import { yogaPresentationText } from '../../../shared/src/yoga-presentation.mjs';

/** Route labels only, not an exemption from the Founder white-label policy. */
export function yogaLegalCopy(route: string) {
  return /(?:^|\/)(?:privacy|partners|terms|legal|agreement)(?:\/|$)/.test(previewSourceRoute(route));
}

function visibleTagAttributes(tag: string) {
  const name = /^<\/?[A-Za-z][\w:-]*/.exec(tag);
  if (!name || tag.startsWith('</')) return tag;
  let cursor = name[0].length, copied = 0, output = '';
  while (cursor < tag.length) {
    while (/\s/.test(tag[cursor] ?? '')) cursor++;
    if (!tag[cursor] || tag[cursor] === '>' || tag[cursor] === '/') break;
    const start = cursor;
    while (cursor < tag.length && !/[\s=/>]/.test(tag[cursor])) cursor++;
    const attribute = tag.slice(start, cursor).toLowerCase();
    while (/\s/.test(tag[cursor] ?? '')) cursor++;
    if (tag[cursor] !== '=') continue;
    cursor++;
    while (/\s/.test(tag[cursor] ?? '')) cursor++;
    const quote = /["']/.test(tag[cursor] ?? '') ? tag[cursor++] : '';
    const valueStart = cursor;
    while (cursor < tag.length && (quote ? tag[cursor] !== quote : !/[\s>]/.test(tag[cursor]))) cursor++;
    if (['aria-label', 'title', 'alt'].includes(attribute)) {
      output += tag.slice(copied, valueStart);
      const value = yogaPresentationText(tag.slice(valueStart, cursor));
      output += quote ? value : '"' + value + '"';
      copied = cursor;
    }
    if (quote) cursor++;
  }
  return output + tag.slice(copied);
}

/** Already trusted/sanitized source HTML. Preserve tag bytes and all addresses,
 * IDs/data fields; project only text nodes and the three visible attributes.
 * This is not an HTML sanitizer or a general API/user-content transform.
 * Quoted '>' and comments must not be mistaken for text-node boundaries.
 * The privacy/partner sources name the service, not a registered legal entity:
 * their obligations, retention periods and qualifiers remain unchanged.
 */
export function yogaDisplayCopy(value: string, route: string) {
  void route;
  let output = '', offset = 0, textStart = 0;
  while (offset < value.length) {
    if (value[offset] !== '<' || !/^(?:<\/?[A-Za-z][\w:-]*(?=[\s/>])|<!--)/.test(value.slice(offset))) { offset++; continue; }
    output += yogaPresentationText(value.slice(textStart, offset));
    const start = offset;
    if (value.startsWith('<!--', offset)) {
      const end = value.indexOf('-->', offset + 4);
      if (end < 0) throw new Error('Unterminated trusted HTML comment');
      offset = end + 3;
      output += value.slice(start, offset);
    } else {
      let quote = '';
      for (offset++; offset < value.length; offset++) {
        const char = value[offset];
        if (quote) { if (char === quote) quote = ''; }
        else if (char === '"' || char === "'") quote = char;
        else if (char === '>') break;
      }
      if (offset === value.length) throw new Error('Unterminated trusted HTML tag');
      const tag = value.slice(start, ++offset);
      if (/^<\/?(?:script|style)\b/i.test(tag)) throw new Error('Executable HTML is not presentation copy');
      output += visibleTagAttributes(tag);
    }
    textStart = offset;
  }
  return output + yogaPresentationText(value.slice(textStart));
}

function fields<T extends object>(input: T, route: string, names: readonly string[]): T {
  const output = { ...input } as Record<string, unknown>;
  for (const key of names) if (typeof output[key] === 'string') output[key] = yogaDisplayCopy(output[key] as string, route);
  return output as T;
}

function linkFields<T extends object>(link: T, route: string): T {
  const record = link as Record<string, unknown>;
  if (typeof record.href === 'string' && yogaLegalCopy(record.href)) {
    const source = previewSourceRoute(record.href);
    const en = route.startsWith('/en/');
    const label = source.startsWith('/partners/') ? (en ? 'Partnership' : 'Партнёрство')
      : source.startsWith('/privacy/') ? (en ? 'Privacy policy' : 'Политика конфиденциальности')
      : (en ? 'Terms' : 'Условия');
    return { ...link, ...(typeof record.label === 'string' ? { label } : {}), ...(typeof record.title === 'string' ? { title: label } : {}) };
  }
  return fields(link, route, ['label', 'title']);
}

function yogaDownload<T extends object>(download: T, route: string): T {
  const projected = fields(download, route, ['label', 'recommendation', 'meta']);
  const href = (download as Record<string, unknown>).href;
  if (href !== '/downloads/all-indonesia-client-guide-safrway-2026.pdf'
      && href !== 'https://safrway.online/downloads/all-indonesia-client-guide-safrway-2026.pdf') return projected;
  // Presentation derivative only. Main source PDF and its binding stay exact.
  return {...projected, href:'/downloads/all-indonesia-client-guide-yoga-2026.pdf',
    fileName:'all-indonesia-client-guide-yoga-2026.pdf', sizeBytes:98_279};
}

export function yogaVisiblePage<T extends {
  route: string; cards: Array<object>; breadcrumbs: Array<object>;
  relatedRoutes: Array<object>; download?: object;
}>(page: T): T {
  const route = page.route;
  return {
    ...fields(page, route, ['title', 'description', 'lead', 'body']),
    cards: page.cards.map(card => fields(card, route, ['title', 'summary', 'note'])),
    breadcrumbs: page.breadcrumbs.map(crumb => fields(crumb, route, ['label'])),
    relatedRoutes: page.relatedRoutes.map(link => linkFields(link, route)),
    ...(page.download ? { download: yogaDownload(page.download, route) } : {}),
  };
}

export function yogaVisibleRegistry<T extends {
  route: string; sections: Array<object>; breadcrumbs: Array<object>;
  related?: Array<object>; ctaActions?: Array<object>;
}>(model: T): T {
  const route = model.route;
  return {
    ...fields(model, route, ['title', 'titleHtml', 'description', 'directHtml', 'introHtml', 'factHtml', 'factHeading', 'familyApplicabilityNote', 'managerLabel', 'relatedLabel']),
    sections: model.sections.map(section => fields(section, route, ['title', 'heading', 'html'])),
    breadcrumbs: model.breadcrumbs.map(crumb => fields(crumb, route, ['label'])),
    ...(model.related ? { related: model.related.map(link => linkFields(link, route)) } : {}),
    ...(model.ctaActions ? { ctaActions: model.ctaActions.map(action => fields(action, route, ['label'])) } : {}),
  };
}
