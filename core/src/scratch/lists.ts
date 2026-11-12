/**
 * The rule lists Scratch mode offers to tick (PLAN.md Q23, Q35), and where
 * each app gets them: mihomo's own site data (MetaCubeX meta-rules-dat,
 * small binary .mrs files) for mihomo apps; blackmatrix7's ios_rule_script
 * for Stash (Clash YAML) and Shadowrocket (its .list files). Both through
 * jsDelivr's testingcf mirror, which loads from inside China.
 *
 * blackmatrix7 splits its big lists: `X_Domain` holds the domains (a fast
 * domain list) and `X` the rest (keywords, IP ranges).
 */
import type { AppId } from '../apps';

export const LIST_IDS = ['ads', 'ai', 'streaming', 'telegram', 'china'] as const;
export type ListId = (typeof LIST_IDS)[number];

/** Where a list's traffic goes: blocked, its own pick-a-server group, or straight out. */
export const LIST_TARGET: Record<ListId, 'reject' | 'group' | 'direct'> = {
  ads: 'reject',
  ai: 'group',
  streaming: 'group',
  telegram: 'group',
  china: 'direct',
};

export interface ListSource {
  /** The rule provider's name in the config. */
  name: string;
  behavior: 'domain' | 'ipcidr' | 'classical';
  format: 'mrs' | 'yaml' | 'text';
  url: string;
}

const CDN = 'https://testingcf.jsdelivr.net/gh';
const META = `${CDN}/MetaCubeX/meta-rules-dat@meta/geo`;
const BM = `${CDN}/blackmatrix7/ios_rule_script@master/rule`;

const mrs = (kind: 'geosite' | 'geoip', file: string): ListSource => ({
  name: `${kind === 'geoip' ? 'ip-' : ''}${file.replace('!', 'not-')}`,
  behavior: kind === 'geoip' ? 'ipcidr' : 'domain',
  format: 'mrs',
  url: `${META}/${kind}/${file}.mrs`,
});

const MIHOMO: Record<ListId, ListSource[]> = {
  ads: [mrs('geosite', 'category-ads-all')],
  ai: [mrs('geosite', 'category-ai-!cn')],
  streaming: [mrs('geosite', 'youtube'), mrs('geosite', 'netflix'), mrs('geosite', 'disney'), mrs('geosite', 'spotify')],
  telegram: [mrs('geosite', 'telegram'), mrs('geoip', 'telegram')],
  china: [mrs('geosite', 'cn'), mrs('geoip', 'cn')],
};

/** blackmatrix7's lists by name, `split` when it has an X_Domain part. */
const BLACKMATRIX: Record<ListId, { list: string; split?: true }[]> = {
  ads: [{ list: 'AdvertisingLite', split: true }],
  ai: [{ list: 'OpenAI' }, { list: 'Claude' }, { list: 'Gemini' }],
  streaming: [{ list: 'YouTube' }, { list: 'Netflix' }, { list: 'Disney' }, { list: 'Spotify' }],
  telegram: [{ list: 'Telegram' }],
  china: [{ list: 'China', split: true }],
};

function blackmatrix(app: 'stash' | 'shadowrocket', id: ListId): ListSource[] {
  const folder = app === 'stash' ? 'Clash' : 'Shadowrocket';
  const ext = app === 'stash' ? 'yaml' : 'list';
  const format = app === 'stash' ? 'yaml' : 'text';
  return BLACKMATRIX[id].flatMap(({ list, split }) => [
    ...(split ? [{ name: `${list}-domains`, behavior: 'domain' as const, format, url: `${BM}/${folder}/${list}/${list}_Domain.${ext}` } as const] : []),
    { name: list, behavior: 'classical' as const, format, url: `${BM}/${folder}/${list}/${list}.${ext}` },
  ]);
}

/** The rule providers a ticked list needs for an app. */
export function listSources(app: AppId, id: ListId): ListSource[] {
  return app === 'mihomo' ? MIHOMO[id] : blackmatrix(app, id);
}
