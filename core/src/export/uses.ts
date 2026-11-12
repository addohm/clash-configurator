/**
 * Which settings each app reads, so the page can grey out the ones the
 * chosen app leaves out (PLAN.md Q7). They stay in the session and the
 * settings file either way: only that app's file goes without them.
 */
import type { AppId } from '../apps';
import { MIHOMO_ONLY, STASH_DNS } from './stash';

/** What Shadowrocket's files are made from (shadowrocket.ts); the rest it sets in the app. */
const SHADOWROCKET_USES = new Set([
  'ipv6', 'proxies', 'proxy-groups', 'rules', 'rule-providers', 'hosts', 'dns',
  'dns.nameserver', 'dns.fallback', 'dns.nameserver-policy', 'dns.proxy-server-nameserver', 'dns.proxy-server-nameserver-policy',
]);

/** True if the app's file leaves this setting out. `key` is top-level, or `dns.<key>`. */
export function unusedBy(app: AppId | null, key: string): boolean {
  if (app === 'stash') return key.startsWith('dns.') ? !STASH_DNS.has(key.slice(4)) : MIHOMO_ONLY.has(key);
  if (app === 'shadowrocket') return !SHADOWROCKET_USES.has(key);
  return false;
}
