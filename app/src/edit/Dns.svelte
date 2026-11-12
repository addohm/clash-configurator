<!--
  DNS: on or off, the address mode, the server lists, fake-IP exceptions and
  per-site DNS, as the config has them. Lists the config doesn't have are
  shown only where they matter (PLAN.md Q10).
-->
<script lang="ts">
  import {
    addToDnsList,
    type Change,
    ChangeError,
    type DnsList,
    dnsOf,
    moveInDnsList,
    policiesOf,
    removeFromDnsList,
    removePolicyChanges,
    setPolicyChanges,
  } from '../../../core/src';
  import { strings as t } from '../i18n';
  import Info from '../lib/Info.svelte';
  import { store } from '../lib/store.svelte';
  import StringList from '../lib/StringList.svelte';
  import Unused from '../lib/Unused.svelte';

  const data = $derived(store.data);
  /** Advanced mode shows the expert settings too (PLAN.md Q31). */
  let { advanced = false }: { advanced?: boolean } = $props();

  const dns = $derived(dnsOf(data));
  const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const mode = $derived(typeof dns['enhanced-mode'] === 'string' ? dns['enhanced-mode'] : '');

  // Simple mode: the main servers only. Advanced: also the ones for finding
  // proxy servers, and default, backup and direct ones when the config has them.
  const shownLists: DnsList[] = $derived(
    advanced
      ? (['nameserver', 'proxy-server-nameserver', 'default-nameserver', 'fallback', 'direct-nameserver'] as const).filter(
          (k) => k === 'nameserver' || k === 'proxy-server-nameserver' || k in dns,
        )
      : ['nameserver'],
  );

  /** Makes an edit; returns why it was refused, or null. */
  function attempt(make: () => Change[]): string | null {
    try {
      if (store.edit(make())) return null;
      const why = store.editError;
      return t.editErrors[why as keyof typeof t.editErrors] ?? why;
    } catch (e) {
      if (!(e instanceof ChangeError)) throw e;
      return t.editErrors[e.message as keyof typeof t.editErrors] ?? e.message;
    }
  }

  const policies = $derived(policiesOf(data));
  let editing: string | null = $state(null);
  let pattern = $state('');
  let servers = $state('');
  let policyError = $state('');

  function startPolicy(p: { pattern: string; servers: string[] } | null) {
    editing = p ? p.pattern : '';
    pattern = p?.pattern ?? '';
    servers = p ? p.servers.join(', ') : '';
    policyError = '';
  }

  function savePolicy() {
    const list = servers.split(',').map((s) => s.trim()).filter((s) => s !== '');
    const old = editing;
    const why = attempt(() => {
      const changes = setPolicyChanges(data, pattern, list);
      // A changed pattern replaces the old one.
      return old && old !== pattern.trim() ? [...removePolicyChanges(data, old), ...changes] : changes;
    });
    policyError = why ?? '';
    if (why === null) editing = null;
  }
</script>

<p class="intro">{t.dns.intro}</p>

<div class="top">
<label class="check">
  <input type="checkbox" checked={dns['enable'] === true} onchange={(e) => attempt(() => [{ op: 'set', path: ['dns', 'enable'], value: e.currentTarget.checked }])} />
  {t.dns.enable}
  <Info text={t.dns.enableInfo} name="dns.enable" />
  <Unused keys={['dns.enable']} />
</label>

<div class="field">
  <label for="dns-mode">{t.dns.mode} <Info text={t.dns.modeInfo} name="dns.enhanced-mode" /> <Unused keys={['dns.enhanced-mode']} /></label>
  <select id="dns-mode" value={mode} onchange={(e) => attempt(() => [{ op: 'set', path: ['dns', 'enhanced-mode'], value: e.currentTarget.value }])}>
    {#if mode === ''}<option value="" disabled>{t.edit.notSetPlain}</option>{/if}
    {#if mode !== '' && mode !== 'fake-ip' && mode !== 'redir-host'}<option value={mode}>{mode}</option>{/if}
    <option value="fake-ip">{t.dns.modes['fake-ip']}</option>
    <option value="redir-host">{t.dns.modes['redir-host']}</option>
  </select>
</div>
</div>

<div class="lists">
{#each shownLists as key (key)}
  <StringList
    label={t.dns.lists[key]}
    info={t.dns.listInfo[key]}
    name={`dns.${key}`}
    items={strings(dns[key])}
    placeholder={t.dns.serverPlaceholder}
    onadd={(v) => attempt(() => addToDnsList(data, key, v))}
    onremove={(i) => attempt(() => removeFromDnsList(data, key, i))}
    onmove={(from, to) => attempt(() => moveInDnsList(data, key, from, to))}
  />
{/each}

{#if advanced && (mode === 'fake-ip' || 'fake-ip-filter' in dns)}
  <StringList
    label={t.dns.lists['fake-ip-filter']}
    info={t.dns.listInfo['fake-ip-filter']}
    name="dns.fake-ip-filter"
    items={strings(dns['fake-ip-filter'])}
    placeholder={t.dns.patternPlaceholder}
    onadd={(v) => attempt(() => addToDnsList(data, 'fake-ip-filter', v))}
    onremove={(i) => attempt(() => removeFromDnsList(data, 'fake-ip-filter', i))}
  />
{/if}
</div>

{#if !advanced}
  <p class="more">{t.dns.moreInAdvanced}</p>
{:else}
<div class="policies">
  <p class="label">{t.dns.policies} <Info text={t.dns.policiesInfo} name="dns.nameserver-policy" /></p>
  {#if policies.length === 0}<p class="muted">{t.dns.empty}</p>{/if}
  <ul>
    {#each policies as p (p.pattern)}
      <li>
        <code class="pattern">{p.pattern}</code>
        <span class="arrow" aria-hidden="true">→</span>
        <code>{p.servers.join(', ')}</code>
        <span class="buttons">
          <button type="button" class="small" onclick={() => startPolicy(p)}>{t.dns.edit}</button>
          <button type="button" class="small" aria-label={t.dns.remove} onclick={() => (policyError = attempt(() => removePolicyChanges(data, p.pattern)) ?? '')}>✕</button>
        </span>
      </li>
    {/each}
  </ul>
  {#if editing !== null}
    <form
      class="policy-form"
      onsubmit={(e) => {
        e.preventDefault();
        savePolicy();
      }}
    >
      <label>
        <span>{t.dns.policyPattern}</span>
        <input type="text" bind:value={pattern} placeholder={t.dns.patternPlaceholder} spellcheck="false" />
      </label>
      <label class="grow">
        <span>{t.dns.policyServers}</span>
        <input type="text" bind:value={servers} placeholder={t.dns.serverPlaceholder} spellcheck="false" />
      </label>
      <div class="buttons">
        <button type="submit" class="primary">{t.edit.save}</button>
        <button type="button" onclick={() => (editing = null)}>{t.edit.cancel}</button>
      </div>
    </form>
  {:else}
    <button type="button" onclick={() => startPolicy(null)}>{t.dns.addPolicy}</button>
  {/if}
  {#if policyError}<p class="error" role="alert">{policyError}</p>{/if}
</div>
{/if}

<style>
  .more {
    margin: 0.5rem 0 0;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .intro {
    margin: 0 0 1rem;
    color: var(--muted);
  }

  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 0.5rem 2rem;
  }

  .check {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.75rem;
  }

  .field {
    margin-bottom: 1rem;
  }

  .field label,
  .label {
    display: block;
    margin: 0 0 0.35rem;
    font-weight: 600;
  }

  select,
  input[type='text'] {
    padding: 0.35rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    font: inherit;
    color: var(--text);
    background: var(--surface);
  }

  /* The lists side by side on wide windows. */
  .lists {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
    gap: 0 1rem;
  }

  .policies ul {
    margin: 0 0 0.5rem;
    padding: 0;
    list-style: none;
  }

  .policies li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem 0.5rem;
    padding: 0.35rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    margin-bottom: 0.3rem;
    background: var(--surface);
  }

  code {
    font-size: 0.85rem;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    overflow-wrap: anywhere;
  }

  .pattern {
    font-weight: 600;
  }

  .arrow {
    color: var(--muted);
  }

  .buttons {
    display: inline-flex;
    gap: 0.25rem;
    margin-left: auto;
  }

  .small {
    padding: 0.1rem 0.45rem;
    font-size: 0.8rem;
  }

  .policy-form {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 0.5rem;
    padding: 0.6rem;
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .policy-form label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.85rem;
  }

  .grow {
    flex: 1 1 16rem;
  }

  .muted {
    margin: 0 0 0.4rem;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .error {
    margin: 0.35rem 0 0;
    font-size: 0.875rem;
    color: var(--danger);
  }
</style>
