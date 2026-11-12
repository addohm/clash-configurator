<!--
  TUN and sniffing (Advanced mode, PLAN.md Q10 part 6): whether the app
  catches all traffic, and whether it reads site names from connections.
  Values come from the config; a setting it doesn't have shows as off.
-->
<script lang="ts">
  import {
    type Change,
    ChangeError,
    checkDomainPattern,
    checkHijack,
    checkPorts,
    SNIFF_PROTOCOLS,
    type SniffProtocol,
    TUN_STACKS,
    type TunStack,
  } from '../../../core/src';
  import { format, strings as t } from '../i18n';
  import Info from '../lib/Info.svelte';
  import { store } from '../lib/store.svelte';
  import StringList from '../lib/StringList.svelte';

  type Map = Record<string, unknown>;
  const isMap = (v: unknown): v is Map => v !== null && typeof v === 'object' && !Array.isArray(v);
  const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

  const data = $derived(store.data);
  const tun = $derived(isMap(data['tun']) ? data['tun'] : {});
  const sniffer = $derived(isMap(data['sniffer']) ? data['sniffer'] : {});
  const sniff = $derived(isMap(sniffer['sniff']) ? sniffer['sniff'] : {});

  let error = $state('');

  /** Makes an edit; returns why it was refused, or null. */
  function attempt(make: () => Change[]): string | null {
    try {
      if (store.edit(make())) return null;
      return store.editError;
    } catch (e) {
      if (!(e instanceof ChangeError)) throw e;
      return t.editErrors[e.message as keyof typeof t.editErrors] ?? e.message;
    }
  }

  const set = (path: (string | number)[], value: boolean | string) => attempt(() => [{ op: 'set', path, value }]);

  const portsOf = (p: SniffProtocol): string => {
    const entry = sniff[p];
    const ports = isMap(entry) && Array.isArray(entry['ports']) ? entry['ports'] : [];
    return ports.map(String).join(', ');
  };

  function toggleProtocol(p: SniffProtocol, on: boolean) {
    error = '';
    const defaults: Record<SniffProtocol, (number | string)[]> = { HTTP: [80, '8080-8880'], TLS: [443, 8443], QUIC: [443, 8443] };
    if (on) attempt(() => [{ op: 'set', path: ['sniffer', 'sniff', p], value: { ports: defaults[p] } }]);
    else if (p in sniff) attempt(() => [{ op: 'delete', path: ['sniffer', 'sniff', p] }]);
  }

  function setPorts(p: SniffProtocol, raw: string) {
    error = '';
    try {
      const ports = checkPorts(raw);
      attempt(() => [{ op: 'set', path: ['sniffer', 'sniff', p, 'ports'], value: ports }]);
    } catch (e) {
      if (!(e instanceof ChangeError)) throw e;
      error = t.tun.badPorts;
    }
  }

  const listChange = (path: string[], items: readonly string[], check: (v: string) => string) => ({
    add: (raw: string): string | null => {
      try {
        const v = check(raw);
        if (items.includes(v)) return t.editErrors['already a member'];
        return attempt(() => [{ op: 'insert', path, value: v }]);
      } catch (e) {
        if (!(e instanceof ChangeError)) throw e;
        return t.editErrors['bad value'];
      }
    },
    remove: (i: number): string | null => attempt(() => [{ op: 'delete', path: [...path, i] }]),
  });

  const hijack = $derived(strings(tun['dns-hijack']));
  const hijackList = $derived(listChange(['tun', 'dns-hijack'], hijack, checkHijack));
  const skip = $derived(strings(sniffer['skip-domain']));
  const skipList = $derived(listChange(['sniffer', 'skip-domain'], skip, checkDomainPattern));
</script>

<p class="intro">{t.tun.intro}</p>

<div class="columns">
  <fieldset>
    <legend>{t.tun.title}</legend>
    <label class="check">
      <input type="checkbox" checked={tun['enable'] === true} onchange={(e) => set(['tun', 'enable'], e.currentTarget.checked)} />
      {t.tun.enable} <Info text={t.tun.enableInfo} name="tun.enable" />
    </label>
    <label class="field">
      <span>{t.tun.stack} <Info text={t.tun.stackInfo} name="tun.stack" /></span>
      <select value={typeof tun['stack'] === 'string' ? tun['stack'].toLowerCase() : ''} onchange={(e) => set(['tun', 'stack'], e.currentTarget.value)}>
        {#if typeof tun['stack'] !== 'string'}<option value="" disabled>{t.edit.notSetPlain}</option>{/if}
        {#each TUN_STACKS as s (s)}<option value={s}>{t.tun.stacks[s as TunStack]}</option>{/each}
      </select>
    </label>
    <label class="check">
      <input type="checkbox" checked={tun['auto-route'] === true} onchange={(e) => set(['tun', 'auto-route'], e.currentTarget.checked)} />
      {t.tun.autoRoute} <Info text={t.tun.autoRouteInfo} name="tun.auto-route" />
    </label>
    <label class="check">
      <input type="checkbox" checked={tun['auto-detect-interface'] === true} onchange={(e) => set(['tun', 'auto-detect-interface'], e.currentTarget.checked)} />
      {t.tun.autoDetect} <Info text={t.tun.autoDetectInfo} name="tun.auto-detect-interface" />
    </label>
    <label class="check">
      <input type="checkbox" checked={tun['strict-route'] === true} onchange={(e) => set(['tun', 'strict-route'], e.currentTarget.checked)} />
      {t.tun.strict} <Info text={t.tun.strictInfo} name="tun.strict-route" />
    </label>
    <StringList
      label={t.tun.hijack}
      info={t.tun.hijackInfo}
      name="tun.dns-hijack"
      items={hijack}
      placeholder={t.tun.hijackPlaceholder}
      onadd={hijackList.add}
      onremove={hijackList.remove}
    />
  </fieldset>

  <fieldset>
    <legend>{t.tun.snifferTitle}</legend>
    <label class="check">
      <input type="checkbox" checked={sniffer['enable'] === true} onchange={(e) => set(['sniffer', 'enable'], e.currentTarget.checked)} />
      {t.tun.sniffer} <Info text={t.tun.snifferInfo} name="sniffer.enable" />
    </label>
    <label class="check">
      <input type="checkbox" checked={sniffer['override-destination'] === true} onchange={(e) => set(['sniffer', 'override-destination'], e.currentTarget.checked)} />
      {t.tun.override} <Info text={t.tun.overrideInfo} name="sniffer.override-destination" />
    </label>
    {#each SNIFF_PROTOCOLS as p (p)}
      <div class="protocol">
        <label class="check">
          <input type="checkbox" checked={p in sniff} onchange={(e) => toggleProtocol(p, e.currentTarget.checked)} />
          {format(t.tun.protocol, { protocol: p })}
        </label>
        {#if p in sniff}
          <input type="text" value={portsOf(p)} aria-label={format(t.tun.protocol, { protocol: p })} onchange={(e) => setPorts(p, e.currentTarget.value)} />
        {/if}
      </div>
    {/each}
    <p class="hint">{t.tun.portsInfo}</p>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <StringList
      label={t.tun.skip}
      info={t.tun.skipInfo}
      name="sniffer.skip-domain"
      items={skip}
      placeholder={t.dns.patternPlaceholder}
      onadd={skipList.add}
      onremove={skipList.remove}
    />
  </fieldset>
</div>

<style>
  .intro {
    margin: 0 0 0.75rem;
    font-size: 0.9rem;
    color: var(--muted);
  }

  .columns {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
    gap: 1rem;
  }

  fieldset {
    margin: 0;
    padding: 0.6rem 0.8rem;
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  legend {
    font-weight: 600;
  }

  .check {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    margin: 0.35rem 0;
  }

  .field {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin: 0.35rem 0;
  }

  .protocol {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  select,
  input[type='text'] {
    padding: 0.3rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    font: inherit;
    color: var(--text);
    background: var(--surface);
  }

  .hint {
    margin: 0.2rem 0 0.5rem;
    font-size: 0.8rem;
    color: var(--muted);
  }

  .error {
    margin: 0.25rem 0;
    font-size: 0.875rem;
    color: var(--danger);
  }
</style>
