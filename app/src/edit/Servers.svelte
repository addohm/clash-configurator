<!--
  Servers: a searchable table that fills the window and scrolls inside
  (PLAN.md Q30). Tick servers to remove them, or keep only them, in one
  edit; rename one (every reference follows); add more from share links
  (read here, nothing fetched). Removal is refused, with the reason, where
  it would break the config.
-->
<script lang="ts">
  import {
    addServersChanges,
    ChangeError,
    groupsOf,
    groupsWithAllServers,
    parseLinks,
    type ParsedLinks,
    removeManyBlockers,
    removeManyChanges,
    renameChanges,
    type RemoveBlocker,
  } from '../../../core/src';
  import { format, strings as t } from '../i18n';
  import Info from '../lib/Info.svelte';
  import { store } from '../lib/store.svelte';

  type Row = { name: string; type: string; address: string };

  const data = $derived(store.data);
  const rows: Row[] = $derived.by(() => {
    const list = Array.isArray(data['proxies']) ? data['proxies'] : [];
    return list.flatMap((p) => {
      if (p === null || typeof p !== 'object' || typeof (p as Record<string, unknown>)['name'] !== 'string') return [];
      const r = p as Record<string, unknown>;
      return [{ name: String(r['name']), type: String(r['type'] ?? ''), address: `${String(r['server'] ?? '')}:${String(r['port'] ?? '')}` }];
    });
  });
  const groups = $derived(groupsOf(data));

  let query = $state('');
  const shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return q === '' ? rows : rows.filter((r) => `${r.name} ${r.type} ${r.address}`.toLowerCase().includes(q));
  });

  // Ticked servers, by name. Names no longer in the config drop out.
  let ticked: string[] = $state([]);
  const tickedNow = $derived(ticked.filter((n) => rows.some((r) => r.name === n)));
  const allShownTicked = $derived(shown.length > 0 && shown.every((r) => tickedNow.includes(r.name)));

  function tick(name: string, on: boolean) {
    ticked = on ? [...tickedNow, name] : tickedNow.filter((n) => n !== name);
  }

  function tickShown(on: boolean) {
    const names = shown.map((r) => r.name);
    ticked = on ? [...new Set([...tickedNow, ...names])] : tickedNow.filter((n) => !names.includes(n));
  }

  // Why the last removal was refused.
  let blocked: RemoveBlocker[] = $state([]);
  let error = $state('');

  function removeNames(names: string[]) {
    error = '';
    blocked = removeManyBlockers(data, names);
    if (blocked.length > 0 || names.length === 0) return;
    if (store.edit(removeManyChanges(data, names))) ticked = [];
  }

  const blockerText = (b: RemoveBlocker) =>
    b.kind === 'rule'
      ? format(t.servers.blockers.rule, { n: b.index + 1 })
      : b.kind === 'dialer'
        ? format(t.servers.blockers.dialer, { server: b.server })
        : format(t.servers.blockers['last-member'], { group: b.group });

  // Renaming one row at a time.
  let renaming: string | null = $state(null);
  let newName = $state('');

  function saveRename() {
    if (renaming === null) return;
    error = '';
    try {
      const changes = renameChanges(data, renaming, newName);
      if (changes.length === 0 || store.edit(changes)) renaming = null;
    } catch (e) {
      if (!(e instanceof ChangeError)) throw e;
      error = t.servers.renameErrors[e.message as keyof typeof t.servers.renameErrors] ?? e.message;
    }
  }

  // Adding from share links.
  let links = $state('');
  let parsed: ParsedLinks | null = $state.raw(null);
  let addTo: string[] = $state([]);
  let addedCount = $state(0);

  function read() {
    parsed = parseLinks(links);
    addTo = groupsWithAllServers(data);
    addedCount = 0;
  }

  function add() {
    if (!parsed || parsed.servers.length === 0) return;
    const { changes, names } = addServersChanges(data, parsed.servers, addTo);
    if (store.edit(changes)) {
      addedCount = names.length;
      parsed = null;
      links = '';
    }
  }
</script>

<p class="intro">{t.servers.intro}</p>

<div class="toolbar">
  <input type="search" bind:value={query} placeholder={t.servers.search} aria-label={t.servers.search} />
  <span class="count">
    {format(t.servers.count, { count: rows.length })}{#if tickedNow.length > 0} · {format(t.servers.tickedCount, { count: tickedNow.length })}{/if}
  </span>
  <button type="button" class="small" disabled={tickedNow.length === 0} onclick={() => removeNames(tickedNow)}>{t.servers.removeTicked}</button>
  <button
    type="button"
    class="small"
    disabled={tickedNow.length === 0}
    onclick={() => removeNames(rows.map((r) => r.name).filter((n) => !tickedNow.includes(n)))}>{t.servers.keepTicked}</button
  >
  <Info text={t.servers.tickInfo} />
</div>

{#if blocked.length > 0}
  <p class="error" role="alert">{t.servers.blocked} {blocked.map(blockerText).join('; ')}.</p>
{/if}
{#if error}<p class="error" role="alert">{error}</p>{/if}

<div class="scroll-panel">
  <table>
    <thead>
      <tr>
        <th class="tick"><input type="checkbox" aria-label={t.servers.tickAll} checked={allShownTicked} onchange={(e) => tickShown(e.currentTarget.checked)} /></th>
        <th>{t.servers.name}</th>
        <th>{t.servers.type}</th>
        <th>{t.servers.address}</th>
        <th class="actions"></th>
      </tr>
    </thead>
    <tbody>
      {#each shown as row (row.name)}
        <tr class:ticked={tickedNow.includes(row.name)}>
          <td class="tick">
            <input type="checkbox" aria-label={row.name} checked={tickedNow.includes(row.name)} onchange={(e) => tick(row.name, e.currentTarget.checked)} />
          </td>
          {#if renaming === row.name}
            <td colspan="3">
              <form
                class="rename"
                onsubmit={(e) => {
                  e.preventDefault();
                  saveRename();
                }}
              >
                <input type="text" bind:value={newName} aria-label={t.servers.name} />
                <button type="submit" class="primary small">{t.edit.save}</button>
                <button type="button" class="small" onclick={() => (renaming = null)}>{t.edit.cancel}</button>
              </form>
            </td>
          {:else}
            <td class="name">{row.name}</td>
            <td class="meta">{row.type}</td>
            <td class="meta">{row.address}</td>
          {/if}
          <td class="actions">
            {#if renaming !== row.name}
              <button
                type="button"
                class="small"
                onclick={() => {
                  renaming = row.name;
                  newName = row.name;
                  error = '';
                }}>{t.servers.rename}</button
              >
              <button type="button" class="small" onclick={() => removeNames([row.name])}>{t.servers.remove}</button>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<details class="add">
  <summary>{t.servers.add}</summary>
  <p class="intro">{t.servers.addInfo}</p>
  <textarea id="add-links" bind:value={links} placeholder={t.servers.addPlaceholder} spellcheck="false" autocomplete="off" aria-label={t.servers.add}></textarea>
  <div class="row">
    <button type="button" disabled={links.trim() === ''} onclick={read}>{t.servers.addRead}</button>
  </div>
  {#if parsed}
    {#each parsed.errors as err (err.line)}
      <p class="error">{format(t.servers.lineError, { line: err.line, reason: format(t.servers.linkErrors[err.code], { detail: err.detail }) })}</p>
    {/each}
    {#if parsed.servers.length > 0}
      <fieldset class="groups">
        <legend>{t.servers.addTo} <Info text={t.servers.addToInfo} /></legend>
        {#each groups as g (g.name)}
          <label>
            <input
              type="checkbox"
              checked={addTo.includes(g.name)}
              onchange={(e) => (addTo = e.currentTarget.checked ? [...addTo, g.name] : addTo.filter((x) => x !== g.name))}
            />
            {g.name}
          </label>
        {/each}
      </fieldset>
      <button type="button" class="primary" onclick={add}>{format(t.servers.addButton, { count: parsed.servers.length })}</button>
    {/if}
  {/if}
  {#if addedCount > 0}<p class="ok" role="status">{format(t.servers.added, { count: addedCount })}</p>{/if}
</details>

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

  input[type='search'],
  input[type='text'],
  textarea {
    padding: 0.35rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    font: inherit;
    color: var(--text);
    background: var(--surface);
  }

  .count {
    font-size: 0.85rem;
    color: var(--muted);
  }

  .small {
    padding: 0.2rem 0.55rem;
    font-size: 0.82rem;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.88rem;
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
    padding: 0.3rem 0.5rem;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }

  tr.ticked td {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }

  .tick {
    width: 2rem;
  }

  .name {
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .meta {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 0.8rem;
    color: var(--muted);
    overflow-wrap: anywhere;
  }

  .actions {
    width: 1%;
    white-space: nowrap;
    text-align: right;
  }

  .actions button + button {
    margin-left: 0.25rem;
  }

  .rename {
    display: flex;
    gap: 0.35rem;
  }

  .rename input {
    flex: 1;
  }

  .add {
    margin-top: 0.75rem;
  }

  .add summary {
    font-weight: 600;
    cursor: pointer;
  }

  textarea {
    display: block;
    width: 100%;
    min-height: 5rem;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 0.85rem;
  }

  .row {
    margin: 0.5rem 0;
  }

  .groups {
    margin: 0.5rem 0;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .groups legend {
    font-weight: 600;
  }

  .groups label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0.2rem 0;
  }

  .error {
    margin: 0.25rem 0 0.5rem;
    font-size: 0.875rem;
    color: var(--danger);
  }

  .ok {
    color: var(--ok);
  }
</style>
