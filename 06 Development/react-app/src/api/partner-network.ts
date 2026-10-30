import type {PartnerNetwork} from './types';

/** Whitelist fields before rendering. Extra backend fields never enter the UI. */
export function partnerNetwork(value: unknown): PartnerNetwork | undefined {
  if (!value || typeof value !== 'object') return;
  const v = value as Record<string, unknown>;
  if (v.restricted_partner !== true || !Number.isSafeInteger(v.direct_count) || Number(v.direct_count) < 0 ||
      !Array.isArray(v.nodes) || v.nodes.length > 100 || typeof v.has_more !== 'boolean' ||
      typeof v.page_limited !== 'boolean' || typeof v.depth_limited !== 'boolean' || !Number.isSafeInteger(v.offset) || Number(v.offset) < 0 || Number(v.offset) > 5000 ||
      !Number.isSafeInteger(v.limit) || Number(v.limit) < 1 || Number(v.limit) > 100 ||
      v.nodes.length > Number(v.limit) || (v.next_offset !== null &&
        (!Number.isSafeInteger(v.next_offset) || Number(v.next_offset) > 5000 || v.next_offset !== Number(v.offset) + Number(v.limit))) ||
      v.page_limited !== (v.has_more && v.next_offset === null) ||
      (v.has_more && v.next_offset === null && Number(v.offset) + Number(v.limit) <= 5000) ||
      (!v.has_more && v.next_offset !== null)) return;
  const nodes: PartnerNetwork['nodes'] = [];
  for (const node of v.nodes) {
    if (!node || typeof node !== 'object' || typeof node.label !== 'string' || !/^№[1-9]\d*$/.test(node.label) ||
        !Number.isSafeInteger(node.level) || node.level < 1 || node.level > 32 ||
        (node.created_at !== null && (typeof node.created_at !== 'string' || !Number.isFinite(Date.parse(node.created_at))))) return;
    nodes.push({label: node.label, level: node.level, created_at: node.created_at});
  }
  return {restricted_partner: true, direct_count: Number(v.direct_count), nodes, has_more: v.has_more,
    page_limited: v.page_limited, depth_limited: v.depth_limited, offset: Number(v.offset), limit: Number(v.limit), next_offset: v.next_offset as number | null};
}
