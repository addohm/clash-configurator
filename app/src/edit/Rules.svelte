<!--
  Rules: where each connection goes, checked from the top. Provider configs
  can hold thousands, so the table is searched and paged, and scrolls in its
  own panel (PLAN.md Q30). A rule's target can be changed, rules moved or
  removed (ticked ones together); new ones go above the final MATCH. Folded
  away below: adding a rule, and the rule lists (providers) the rules use.
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
    removeManyRulesChanges,
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

  // Enough to fill a big window; the panel scrolls within a page.
  const PAGE = 200;

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

  // Ticked rules, by position; cleared after any edit, since positions shift.
  let ticked: number[] = $state([]);
  $effect(() => {
    void store.version;
    ticked = [];
  });
  const allShownTicked = $derived(shown.length > 0 && shown.every((r) => ticked.includes(r.index)));

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

<div class="toolbar">
  <input type="search" bind:value={query} oninput={() => (page = 0)} placeholder={t.rules.search} aria-label={t.rules.search} />
  <Info text={t.rules.searchInfo} />
  <span class="count">
    {format(t.rules.count, { count: rules.length })}
    {#if matching.length > 0 && matching.length !== rules.length} · {format(t.rules.matching, { count: matching.length })}{/if}
    {#if ticked.length > 0} · {format(t.servers.tickedCount, { count: ticked.length })}{/if}
  </span>
  <button type="button" class="small" disabled={ticked.length === 0} onclick={() => attempt(() => removeManyRulesChanges(data, ticked))}>{t.rules.removeTicked}</button>
</div>
{#if error}<p class="error" role="alert">{error}</p>{/if}
{#if message}<p class="ok" role="status">{message}</p>{/if}

<div class="scroll-panel">
  {#if shown.length === 0}
    <p class="muted empty">{t.rules.none}</p>
  {:else}
    <table>
      <thead>
        <tr>
          <th class="tick">
            <input
              type="checkbox"
              aria-label={t.servers.tickAll}
              checked={allShownTicked}
              onchange={(e) => {
                const on = e.currentTarget.checked;
                const idx = shown.map((r) => r.index);
                ticked = on ? [...new Set([...ticked, ...idx])] : ticked.filter((i) => !idx.includes(i));
              }}
            />
          </th>
          <th class="n">#</th>
          <th>{t.rules.kind}</th>
          <th>{t.rules.addValue}</th>
          <th>{t.rules.goesTo}</th>
          <th class="actions"></th>
        </tr>
      </thead>
      <tbody>
        {#each shown as r (r.index)}
          <tr class:match={r.type === 'MATCH'} class:ticked={ticked.includes(r.index)}>
            <td class="tick">
              <input
                type="checkbox"
                aria-label={`${t.rules.rule} ${r.index + 1}`}
                checked={ticked.includes(r.index)}
                onchange={(e) => (ticked = e.currentTarget.checked ? [...ticked, r.index] : ticked.filter((i) => i !== r.index))}
              />
            </td>
            <td class="n">{r.index + 1}</td>
            <td class="type">{typeLabel(r.type)}</td>
            <td class="what">
              {#if r.payload}<code>{r.payload}</code>{/if}
              {#if r.options.length > 0}<span class="muted">{r.options.join(', ')}</span>{/if}
            </td>
            <td class="target">
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
            </td>
            <td class="actions">
              <button type="button" class="small" aria-label={t.rules.up} disabled={r.index === 0} onclick={() => attempt(() => moveRuleChanges(data, r.index, r.index - 1))}>↑</button>
              <button type="button" class="small" aria-label={t.rules.down} disabled={r.index === rules.length - 1} onclick={() => attempt(() => moveRuleChanges(data, r.index, r.index + 1))}>↓</button>
              <button type="button" class="small" aria-label={t.rules.remove} onclick={() => attempt(() => removeRuleChanges(data, r.index))}>✕</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>
{#if pages > 1}
  <div class="pager">
    <button type="button" class="small" disabled={page === 0} onclick={() => page--}>{t.rules.previous}</button>
    <span>{format(t.rules.showing, { from: page * PAGE + 1, to: Math.min(matching.length, (page + 1) * PAGE), total: matching.length })}</span>
    <button type="button" class="small" disabled={page >= pages - 1} onclick={() => page++}>{t.rules.next}</button>
  </div>
{/if}

<details class="fold">
  <summary>{t.rules.add}</summary>
  <p class="intro">{t.rules.addInfo}</p>
  <fieldset class="add">
    <legend class="sr">{t.rules.add}</legend>
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
</details>

{#if lists.length > 0}
  <details class="fold">
    <summary>{t.rules.lists} ({lists.length})</summary>
    <p class="intro">{t.rules.listsInfo}</p>
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
  </details>
{/if}

<style>
  .intro {
    margin: 0 0 0.5rem;
    font-size: 0.9rem;
    color: var(--muted);
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 0.6rem;
    margin-bottom: 0.5rem;
  }

  .toolbar input[type='search'] {
    flex: 1 1 14rem;
  }

  .count {
    font-size: 0.85rem;
    color: var(--muted);
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

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.86rem;
  }

  thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid var(--border);
    text-align: left;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--muted);
    background: var(--surface);
  }

  td {
    padding: 0.25rem 0.5rem;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }

  tr.match td {
    background: var(--bg);
  }

  tr.ticked td {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }

  .tick {
    width: 2rem;
  }

  .n {
    width: 3rem;
    font-size: 0.75rem;
    color: var(--muted);
  }

  .type {
    white-space: nowrap;
    font-weight: 600;
  }

  .what {
    overflow-wrap: anywhere;
  }

  code {
    font-size: 0.8rem;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  }

  .target select,
  .target-name {
    max-width: 14rem;
  }

  .target-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .actions {
    width: 1%;
    white-space: nowrap;
    text-align: right;
  }

  .actions button + button {
    margin-left: 0.2rem;
  }

  .small {
    padding: 0.15rem 0.5rem;
    font-size: 0.8rem;
  }

  .empty {
    padding: 0.75rem;
  }

  .pager {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-top: 0.4rem;
    font-size: 0.85rem;
  }

  .fold {
    margin-top: 0.75rem;
  }

  .fold summary {
    font-weight: 600;
    cursor: pointer;
  }

  .add {
    margin: 0;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
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

  .lists {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .lists li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.6rem;
    padding: 0.35rem 0;
    border-bottom: 1px solid var(--border);
  }

  .name {
    font-weight: 600;
  }

  .push {
    margin-left: auto;
  }

  .muted {
    font-size: 0.8rem;
    color: var(--muted);
  }

  .error {
    margin: 0.25rem 0 0.5rem;
    color: var(--danger);
  }

  .ok {
    margin: 0.25rem 0 0.5rem;
    color: var(--ok);
  }
</style>
