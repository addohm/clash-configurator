<!-- Basics: mode, ports, sharing with the network, IPv6. Values come from the config. -->
<script lang="ts">
  import type { Change } from '../../../core/src';
  import { format, strings as t } from '../i18n';
  import Info from '../lib/Info.svelte';
  import Unused from '../lib/Unused.svelte';
  import { store } from '../lib/store.svelte';

  const MODES = ['rule', 'global', 'direct'] as const;
  const PORTS = ['mixed-port', 'port', 'socks-port', 'redir-port', 'tproxy-port'] as const;

  const data = $derived(store.data);
  // Panels often write "Rule"; mihomo reads any case.
  const mode = $derived(typeof data['mode'] === 'string' ? data['mode'].toLowerCase() : '');
  // The ports the config sets; a config without any gets the mixed port to fill in.
  const ports = $derived.by(() => {
    const set = PORTS.filter((p) => p in data);
    return set.length > 0 ? set : (['mixed-port'] as const);
  });
  let portError = $state('');

  function setPort(key: (typeof PORTS)[number], raw: string) {
    portError = '';
    const v = raw.trim();
    if (v === '') {
      if (key in data) store.edit([{ op: 'delete', path: [key] }]);
      return;
    }
    const n = Number(v);
    if (!/^\d+$/.test(v) || n < 1 || n > 65535) {
      portError = t.basics.badPort;
      return;
    }
    if (data[key] !== n) store.edit([{ op: 'set', path: [key], value: n }]);
  }

  function toggle(key: 'allow-lan' | 'ipv6', on: boolean) {
    const change: Change = { op: 'set', path: [key], value: on };
    store.edit([change]);
  }
</script>

<p class="intro">{t.basics.intro}</p>

<div class="field">
  <label for="basics-mode">{t.basics.mode} <Info text={t.basics.modeInfo} name="mode" /> <Unused keys={['mode']} /></label>
  <select id="basics-mode" value={mode} onchange={(e) => store.edit([{ op: 'set', path: ['mode'], value: e.currentTarget.value }])}>
    {#if mode === ''}<option value="" disabled>{format(t.edit.notSet, { value: t.basics.modes.rule })}</option>{/if}
    {#each MODES as m (m)}<option value={m}>{t.basics.modes[m]}</option>{/each}
  </select>
</div>

<fieldset class="field">
  <legend>{t.basics.ports} <Info text={t.basics.portsInfo} /> <Unused keys={[...ports]} /></legend>
  {#each ports as key (key)}
    <label class="port">
      <span>{t.basics.portNames[key]}</span>
      <input
        type="text"
        inputmode="numeric"
        value={typeof data[key] === 'number' ? String(data[key]) : ''}
        placeholder={key in data ? '' : t.edit.notSetPlain}
        onchange={(e) => setPort(key, e.currentTarget.value)}
      />
      <code>{key}</code>
    </label>
  {/each}
  {#if portError}<p class="error" role="alert">{portError}</p>{/if}
</fieldset>

<label class="check">
  <input type="checkbox" checked={data['allow-lan'] === true} onchange={(e) => toggle('allow-lan', e.currentTarget.checked)} />
  {t.basics.allowLan}
  <Info text={t.basics.allowLanInfo} name="allow-lan" />
  <Unused keys={['allow-lan']} />
</label>

<label class="check">
  <input type="checkbox" checked={data['ipv6'] === true} onchange={(e) => toggle('ipv6', e.currentTarget.checked)} />
  {t.basics.ipv6}
  <Info text={t.basics.ipv6Info} name="ipv6" />
  {#if !('ipv6' in data)}<span class="muted">({t.edit.notSetPlain})</span>{/if}
</label>

<style>
  .intro {
    margin: 0 0 1rem;
    color: var(--muted);
  }

  .field {
    margin: 0 0 1rem;
    padding: 0;
    border: 0;
  }

  .field > label,
  legend {
    display: block;
    margin-bottom: 0.35rem;
    font-weight: 600;
  }

  select,
  input[type='text'] {
    padding: 0.4rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    font: inherit;
    color: var(--text);
    background: var(--surface);
  }

  .port {
    display: grid;
    grid-template-columns: minmax(10rem, 16rem) 8rem auto;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.35rem;
  }

  code {
    font-size: 0.8rem;
    color: var(--muted);
  }

  .check {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.6rem;
  }

  .muted {
    font-size: 0.85rem;
    color: var(--muted);
  }

  .error {
    margin: 0.35rem 0 0;
    color: var(--danger);
  }

  @media (max-width: 560px) {
    .port {
      grid-template-columns: 1fr 7rem;
    }
    .port code {
      display: none;
    }
  }
</style>
