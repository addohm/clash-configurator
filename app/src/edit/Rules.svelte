<!--
  Rules: where each connection goes, checked from the top. Provider configs
  can hold thousands, so the list is searched and paged. Each rule's target
  can be changed, and rules moved or removed; new ones go above the final
  MATCH. Below: the rule lists (providers) the rules use.
-->
<script lang="ts">
  import {
    ADDABLE_RULES,
    type AddableRule,
    addRuleChanges,
    type Change,
    ChangeError,
    groupsOf,
    insertPosition,
    IP_RULES,
    moveRuleChanges,
    removeRuleChanges,
    removeRuleProviderChanges,
    ruleProvidersOf,
    rulesOf,
    ruleSetUses,
    serverNames,
    setRuleTargetChanges,
  } from '../../../core/src';
  import { format, strings as t } from '../i18n';
  import Info from '../lib/Info.svelte';
  import { store } from '../lib/store.svelte';

  const PAGE = 50;

  const data = $derived(store.data);
  const rules = $derived(rulesOf(data));
  const targets = $derived([...groupsOf(data).map((g) => g.name), 'DIRECT', 'REJECT', ...serverNames(data)]);

  let query = $state('');
  let page = $state(0);
  const matching = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return q === '' ? rules : rules.filter((r) => r.text.toLowerCase().includes(q));
  });
  const pages = $derived(Math.max(1, Math.ceil(matching.length / PAGE)));
  const shown = $derived(matching.slice(page * PAGE, page * PAGE + PAGE));

  let error = $state('');
  let message = $state('');
  /** The rule whose target dropdown is open. */
  let retargeting: number | null = $state(null);

  function attempt(make: () => Change[]): boolean {
    error = '';
    message = '';
    try {
      return store.edit(make());
    } catch (e) {
      if (!(e instanceof ChangeError)) throw e;
      error = t.editErrors[e.message as keyof typeof t.editErrors] ?? e.message;
      return false;
    }
  }

  const typeLabel = (type: string) => (t.rules.types as Record<string, string>)[type] ?? type;

  // The add-a-rule form.
  let addType: AddableRule = $state('DOMAIN-SUFFIX');
  let addValue = $state('');
  let addTarget = $state('');
  let noResolve = $state(true);

  function add() {
    const at = insertPosition(data);
    const rule = { type: addType, value: addValue, target: addTarget || (targets[0] ?? 'DIRECT'), noResolve };
    if (attempt(() => addRuleChanges(data, rule))) {
      message = format(t.rules.added, { n: at + 1 });
      addValue = '';
    }
  }

  const lists = $derived(ruleProvidersOf(data));
  const hostOf = (source: string) => {
    try {
      return new URL(source).host;
    } catch {
      return source;
    }
  };
</script>

<p class="intro">{t.rules.intro}</p>

<div class="search">
  <label for="rule-search">{t.rules.search} <Info text={t.rules.searchInfo} /></label>
  <input id="rule-search" type="search" bind:value={query} oninput={() => (page = 0)} />
</div>
<p class="count">
  {format(t.rules.count, { count: rules.length })}
  {#if matching.length > 0}
    · {format(t.rules.showing, { from: page * PAGE + 1, to: Math.min(matching.length, (page + 1) * PAGE), total: matching.length })}
  {/if}
</p>
{#if error}<p class="error" role="alert">{error}</p>{/if}
{#if message}<p class="ok" role="status">{message}</p>{/if}

{#if shown.length === 0}
  <p class="muted">{t.rules.none}</p>
{:else}
  <ol class="rules">
    {#each shown as r (r.index)}
      <li class:match={r.type === 'MATCH'}>
        <span class="n">{r.index + 1}</span>
        <span class="what">
          <span class="type">{typeLabel(r.type)}</span>
          {#if r.payload}<code>{r.payload}</code>{/if}
          {#if r.options.length > 0}<span class="muted">{r.options.join(', ')}</span>{/if}
        </span>
        <span class="target">
          <span class="muted">{t.rules.goesTo}</span>
          {#if retargeting === r.index}
            <!-- svelte-ignore a11y_autofocus -->
            <select
              autofocus
              aria-label={t.rules.goesTo}
              value={r.target}
              onchange={(e) => {
                attempt(() => setRuleTargetChanges(data, r.index, e.currentTarget.value));
                retargeting = null;
              }}
              onblur={() => (retargeting = null)}
            >
              {#if !targets.includes(r.target)}<option value={r.target}>{r.target}</option>{/if}
              {#each targets as name (name)}<option value={name}>{name}</option>{/each}
            </select>
          {:else}
            <!-- One dropdown at a time: thousands of rules times every group would be slow. -->
            <button type="button" class="small target-name" title={t.rules.changeTarget} onclick={() => (retargeting = r.index)}>{r.target}</button>
          {/if}
        </span>
        <span class="buttons">
          <button type="button" class="small" aria-label={t.rules.up} disabled={r.index === 0} onclick={() => attempt(() => moveRuleChanges(data, r.index, r.index - 1))}>↑</button>
          <button type="button" class="small" aria-label={t.rules.down} disabled={r.index === rules.length - 1} onclick={() => attempt(() => moveRuleChanges(data, r.index, r.index + 1))}>↓</button>
          <button type="button" class="small" aria-label={t.rules.remove} onclick={() => attempt(() => removeRuleChanges(data, r.index))}>✕</button>
        </span>
      </li>
    {/each}
  </ol>
  {#if pages > 1}
    <div class="pager">
      <button type="button" disabled={page === 0} onclick={() => page--}>{t.rules.previous}</button>
      <span>{page + 1} / {pages}</span>
      <button type="button" disabled={page >= pages - 1} onclick={() => page++}>{t.rules.next}</button>
    </div>
  {/if}
{/if}

<fieldset class="add">
  <legend>{t.rules.add} <Info text={t.rules.addInfo} /></legend>
  <div class="inline">
    <label>
      <span>{t.rules.addType}</span>
      <select bind:value={addType}>
        {#each ADDABLE_RULES as type (type)}<option value={type}>{typeLabel(type)}</option>{/each}
      </select>
    </label>
    <label class="grow">
      <span>{t.rules.addValue}</span>
      <input type="text" bind:value={addValue} placeholder={t.rules.placeholders[addType]} spellcheck="false" autocomplete="off" />
    </label>
    <label>
      <span>{t.rules.addTarget}</span>
      <select bind:value={addTarget}>
        {#each targets as name (name)}<option value={name}>{name}</option>{/each}
      </select>
    </label>
  </div>
  {#if IP_RULES.has(addType)}
    <label class="check">
      <input type="checkbox" bind:checked={noResolve} />
      {t.rules.noResolve}
      <Info text={t.rules.noResolveInfo} name="no-resolve" />
    </label>
  {/if}
  <button type="button" class="primary" disabled={addValue.trim() === ''} onclick={add}>{t.rules.add}</button>
</fieldset>

{#if lists.length > 0}
  <h4>{t.rules.lists} <Info text={t.rules.listsInfo} name="rule-providers" /></h4>
  <ul class="lists">
    {#each lists as l (l.name)}
      {@const uses = ruleSetUses(data, l.name)}
      <li>
        <span class="name">{l.name}</span>
        <span class="muted">{l.behavior} · {l.format} · {hostOf(l.source)}</span>
        <span class="muted">{uses.length > 0 ? format(t.rules.listUsed, { rules: uses.map((i) => i + 1).join(', ') }) : t.rules.listUnused}</span>
        <button type="button" class="small push" disabled={uses.length > 0} onclick={() => attempt(() => removeRuleProviderChanges(data, l.name))}>{t.rules.removeList}</button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .intro {
    margin: 0 0 0.75rem;
    color: var(--muted);
  }

  .search label {
    display: block;
    margin-bottom: 0.25rem;
    font-weight: 600;
  }

  .count {
    margin: 0.5rem 0;
    font-size: 0.875rem;
  }

  input[type='search'],
  input[type='text'],
  select {
    padding: 0.35rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    font: inherit;
    color: var(--text);
    background: var(--surface);
  }

  input[type='search'] {
    width: 100%;
  }

  .rules,
  .lists {
    margin: 0 0 1rem;
    padding: 0;
    list-style: none;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
  }

  .rules li,
  .lists li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.6rem;
    padding: 0.4rem 0.6rem;
    border-bottom: 1px solid var(--border);
  }

  .rules li:last-child,
  .lists li:last-child {
    border-bottom: 0;
  }

  .rules li.match {
    background: var(--bg);
  }

  .n {
    min-width: 2.5rem;
    font-size: 0.75rem;
    color: var(--muted);
  }

  .what {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.35rem;
    flex: 1 1 14rem;
    overflow-wrap: anywhere;
  }

  .type {
    font-size: 0.85rem;
    font-weight: 600;
  }

  code {
    font-size: 0.8rem;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  }

  .target {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .target select {
    max-width: 14rem;
  }

  .target-name {
    max-width: 14rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .buttons,
  .push {
    margin-left: auto;
  }

  .buttons {
    display: inline-flex;
    gap: 0.25rem;
  }

  .small {
    padding: 0.15rem 0.5rem;
    font-size: 0.8rem;
  }

  .pager {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: -0.5rem 0 1rem;
    font-size: 0.875rem;
  }

  .add {
    margin: 0 0 1rem;
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .add legend {
    font-weight: 600;
  }

  .inline {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .inline label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.85rem;
  }

  .grow {
    flex: 1 1 12rem;
  }

  .check {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
  }

  h4 {
    margin: 0 0 0.5rem;
    font-size: 0.95rem;
  }

  .name {
    font-weight: 600;
  }

  .muted {
    font-size: 0.8rem;
    color: var(--muted);
  }

  .error {
    color: var(--danger);
  }

  .ok {
    color: var(--ok);
  }
</style>
