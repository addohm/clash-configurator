<!--
  Scratch mode (PLAN.md Q23, Q35): a new config from nothing, one step at a
  time. Every step opens with what that part of a config is and why it's
  there. The last step makes the config and opens it in Review, or for
  editing in Simple or Advanced mode.
-->
<script lang="ts">
  import { countryGroups, LIST_GROUPS, LIST_IDS, type ListId, scratchConfig, TARGET_APPS } from '../../../core/src';
  import { format, refusalText, strings as t } from '../i18n';
  import Info from '../lib/Info.svelte';
  import { inApp } from '../lib/save';
  import { store } from '../lib/store.svelte';
  import { SCRATCH_STEPS, scratch } from './scratch.svelte';

  const s = t.scratch;
  let pasted = $state('');
  let url = $state('');
  let fetching = $state(false);
  let error = $state('');
  const canFetch = inApp();

  const countries = $derived(scratch.countries ? countryGroups(scratch.servers) : []);
  const next = $derived(SCRATCH_STEPS[SCRATCH_STEPS.indexOf(scratch.step) + 1]);
  const back = $derived(SCRATCH_STEPS[SCRATCH_STEPS.indexOf(scratch.step) - 1]);
  const ready = $derived(scratch.step === 'app' ? store.app !== null : scratch.step === 'servers' ? scratch.servers.length > 0 : true);

  function readPasted() {
    error = '';
    scratch.read(pasted, { kind: 'paste' });
    if (scratch.refusal) error = format(s.refused, { reason: refusalText(scratch.refusal) });
    else if (scratch.servers.length === 0) error = s.noServers;
  }

  async function readUrl() {
    error = '';
    fetching = true;
    try {
      const r = await scratch.readUrl(url);
      if (!r.ok) error = format(t.input.fetchErrors[r.code], { detail: r.detail });
      else if (scratch.refusal) error = format(s.refused, { reason: refusalText(scratch.refusal) });
      else if (scratch.servers.length === 0) error = s.noServers;
    } finally {
      fetching = false;
    }
  }

  function toggleList(id: ListId, on: boolean) {
    scratch.lists = on ? LIST_IDS.filter((x) => x === id || scratch.lists.includes(x)) : scratch.lists.filter((x) => x !== id);
  }

  function finish(then: 'review' | 'simple' | 'advanced') {
    if (!store.app || !scratch.source) return;
    const text = scratchConfig({
      app: store.app,
      servers: [...scratch.servers],
      auto: scratch.auto,
      countries: scratch.countries,
      lists: scratch.lists,
      dns: scratch.dns,
      notes: s.notes,
    });
    error = store.finishScratch(text, scratch.source, then) ? '' : s.failed;
  }
</script>

<p class="intro">{s.intros[scratch.step]}</p>

{#if scratch.step === 'app'}
  <div class="choices" role="radiogroup" aria-label={t.steps.app}>
    {#each TARGET_APPS as a (a.id)}
      <label class="choice">
        <input type="radio" name="scratch-app" checked={store.app === a.id} onchange={() => (store.app = a.id)} />
        <span><strong>{t.apps[a.id]}</strong> <span class="muted">{t.apps[`${a.id}Hint`]}</span></span>
      </label>
    {/each}
  </div>
{:else if scratch.step === 'servers'}
  <label class="block">
    <span>{s.pasteLabel}</span>
    <textarea bind:value={pasted} spellcheck="false" placeholder={s.pastePlaceholder}></textarea>
  </label>
  <button type="button" onclick={readPasted} disabled={pasted.trim() === ''}>{s.read}</button>
  {#if canFetch}
    <label class="block">
      <span>{s.urlLabel} <Info text={s.urlInfo} /></span>
      <span class="row">
        <input type="url" bind:value={url} placeholder={t.input.urlPlaceholder} spellcheck="false" />
        <button type="button" onclick={readUrl} disabled={fetching || url.trim() === ''}>{fetching ? t.input.fetching : t.input.fetch}</button>
      </span>
    </label>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if scratch.servers.length > 0}
    <p class="ok">{format(s.found, { count: scratch.servers.length })}</p>
    {#if scratch.skipped.length > 0}<p class="muted">{format(s.skipped, { count: scratch.skipped.length })}</p>{/if}
    <ul class="scroll-panel names">
      {#each scratch.servers as server, i (i)}<li>{String(server['name'] ?? '')}</li>{/each}
    </ul>
  {/if}
{:else if scratch.step === 'groups'}
  <p class="muted">{s.groupsAlways}</p>
  <label class="check">
    <input type="checkbox" bind:checked={scratch.auto} />
    {s.auto}
    <Info text={s.autoInfo} name="url-test" />
  </label>
  <label class="check">
    <input type="checkbox" bind:checked={scratch.countries} />
    {s.countries}
    <Info text={s.countriesInfo} />
  </label>
  {#if scratch.countries}
    {#if countries.length > 0}
      <ul class="names">
        {#each countries as g (g.name)}<li>{format(s.countryGroup, { name: g.name, count: g.servers.length })}</li>{/each}
      </ul>
    {:else}
      <p class="muted">{s.noCountries}</p>
    {/if}
  {/if}
{:else if scratch.step === 'rules'}
  {#each LIST_IDS as id (id)}
    <label class="check list">
      <input type="checkbox" checked={scratch.lists.includes(id)} onchange={(e) => toggleList(id, e.currentTarget.checked)} />
      <span>
        <strong>{s.lists[id].name}</strong>
        <span class="muted">{format(s.lists[id].what, { group: LIST_GROUPS[id] ?? '' })}</span>
      </span>
    </label>
  {/each}
  <p class="muted">{s.rulesRest}</p>
{:else if scratch.step === 'dns'}
  <label class="check">
    <input type="checkbox" bind:checked={scratch.dns} />
    {s.dnsUse}
    <Info text={s.dnsInfo} name="dns" />
  </label>
  {#if scratch.dns}
    <ul class="names">
      {#each s.dnsWhat as line, i (i)}<li>{line}</li>{/each}
    </ul>
  {/if}
{:else}
  <p>
    {format(s.summary, {
      servers: scratch.servers.length,
      groups: 1 + (scratch.auto && scratch.servers.length > 1 ? 1 : 0) + countries.length + scratch.lists.filter((id) => LIST_GROUPS[id]).length,
      lists: scratch.lists.length,
    })}
  </p>
  <div class="actions">
    <button type="button" class="primary" onclick={() => finish('review')}>{s.toReview}</button>
    <button type="button" onclick={() => finish('simple')}>{s.toSimple}</button>
    <button type="button" onclick={() => finish('advanced')}>{s.toAdvanced}</button>
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
{/if}

<div class="nav">
  {#if back}<button type="button" onclick={() => scratch.open(back)}>{t.edit.back}</button>{/if}
  {#if next}
    <button type="button" class="primary" disabled={!ready} onclick={() => scratch.go(next)}>{t.edit.next}</button>
  {/if}
</div>

<style>
  .intro {
    margin: 0 0 1rem;
    color: var(--muted);
  }

  .choices {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .choice,
  .check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .check.list {
    align-items: flex-start;
  }

  .check.list span {
    display: flex;
    flex-direction: column;
  }

  .block {
    display: block;
    margin: 0.75rem 0 0.5rem;
  }

  .block > span {
    display: block;
    margin-bottom: 0.35rem;
    font-size: 0.875rem;
    color: var(--muted);
  }

  .row {
    display: flex;
    gap: 0.5rem;
  }

  .row input {
    flex: 1;
  }

  textarea {
    width: 100%;
    min-height: 8rem;
    padding: 0.6rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 0.8rem;
    color: var(--text);
    background: var(--bg);
  }

  .names {
    margin: 0.5rem 0;
    padding-left: 1.25rem;
    font-size: 0.9rem;
  }

  .actions,
  .nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .muted {
    font-size: 0.875rem;
    color: var(--muted);
  }

  .ok {
    color: var(--ok);
  }

  .error {
    color: var(--danger);
  }
</style>
