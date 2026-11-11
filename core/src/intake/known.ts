/**
 * What intake recognises. Settings not listed here are kept unchanged and
 * listed for the user (PLAN.md Q4), so a newer or app-specific setting is
 * never silently dropped.
 */

/** Top-level settings of mihomo, plus the Stash-only ones the checks look at. */
export const KNOWN_TOP_LEVEL_KEYS: ReadonlySet<string> = new Set([
  // Ports and access
  'port', 'socks-port', 'redir-port', 'tproxy-port', 'mixed-port',
  'allow-lan', 'bind-address', 'lan-allowed-ips', 'lan-disallowed-ips',
  'authentication', 'skip-auth-prefixes', 'inbound-tfo', 'inbound-mptcp',
  // General
  'mode', 'log-level', 'ipv6', 'unified-delay', 'tcp-concurrent', 'find-process-mode',
  'interface-name', 'routing-mark', 'global-client-fingerprint', 'global-ua', 'etag-support',
  'keep-alive-interval', 'keep-alive-idle', 'disable-keep-alive', 'profile', 'tls',
  // Controller and dashboard
  'external-controller', 'external-controller-tls', 'external-controller-unix',
  'external-controller-pipe', 'external-controller-cors', 'external-doh-server', 'secret',
  'external-ui', 'external-ui-name', 'external-ui-url',
  // Geo data
  'geodata-mode', 'geodata-loader', 'geosite-matcher', 'geo-auto-update', 'geo-update-interval', 'geox-url',
  // Name lookups
  'dns', 'hosts', 'use-hosts', 'use-system-hosts',
  // Traffic capture
  'tun', 'sniffer', 'iptables', 'ebpf', 'auto-redir', 'ntp', 'experimental',
  // Servers, groups and rules
  'proxies', 'proxy-groups', 'proxy-providers', 'rule-providers', 'rules', 'sub-rules',
  'listeners', 'tunnels',
  // Flagged by the checks, so known to them (Clash Premium and Stash)
  'script', 'scripts', 'script-providers', 'mitm', 'http',
  // Clash for Android's own section
  'clash-for-android',
]);

/**
 * Where well-known dashboards are published. external-ui-url pointing
 * anywhere else is flagged: the app would download and run that page.
 * Compared lowercased, as prefixes.
 */
export const KNOWN_DASHBOARD_SOURCES: readonly string[] = [
  'https://github.com/metacubex/metacubexd/',
  'https://github.com/metacubex/yacd-meta/',
  'https://github.com/zephyruso/zashboard/',
  'https://github.com/haishanh/yacd/',
];
