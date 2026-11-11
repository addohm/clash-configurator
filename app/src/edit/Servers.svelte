<!--
  Servers: the config's list, with rename (every reference follows), remove
  (refused, with the reason, where it would break something) and add from
  share links (read here, nothing fetched).
-->
<script lang="ts">
  import {
    addServersChanges,
    ChangeError,
    groupsOf,
    groupsWithAllServers,
    parseLinks,
    type ParsedLinks,
    removeBlockers,
    removeServerChanges,
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

  // Renaming one row at a time.
  let renaming: string | null = $state(null);
  let newName = $state('');
  let renameError = $state('');

  function startRename(name: string) {
    renaming = name;
    newName = name;
    renameError = '';
  }

  function saveRename() {
    if (renaming === null) return;
    try {
      const changes = renameChanges(data, renaming, newName);
      if (changes.length === 0 || store.edit(changes)) renaming = null;
    } catch (e) {
      if (!(e instanceof ChangeError)) throw e;
      renameError = t.servers.renameErrors[e.message as keyof typeof t.servers.renameErrors] ?? e.message;
    }
  }

  // Why a server can't be removed, shown under its row.
  let blocked: { name: string; why: RemoveBlocker[] } | null = $state(null);

  function remove(name: string) {
    const why = removeBlockers(data, name);
    if (why.length > 0) {
      blocked = { name, why };
      return;
    }
    blocked = null;
    store.edit(removeServerChanges(data, name));
  }

  const blockerText = (b: RemoveBlocker) =>
    b.kind === 'rule'
      ? format(t.servers.blockers.rule, { n: b.index + 1 })
      : b.kind === 'dialer'
        ? format(t.servers.blockers.dialer, { server: b.server })
        : format(t.servers.blockers['last-member'], { group: b.group });

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

  function toggleGroup(name: string, on: boolean) {
    addTo = on ? [...addTo, name] : addTo.filter((g) => g !== name);
  }
</script>

<p class="intro">{t.servers.intro}</p>
<p class="count">{format(t.servers.count, { count: rows.length })}</p>

<ul class="servers">
  {#each rows as row (row.name)}
    <li>
      {#if renaming === row.name}
        <form
          class="rename"
          onsubmit={(e) => {
            e.preventDefault();
            saveRename();
          }}
        >
          <input type="text" bind:value={newName} aria-label={t.servers.name} />
          <button type="submit" class="primary">{t.edit.save}</button>
          <button type="button" onclick={() => (renaming = null)}>{t.edit.cancel}</button>
        </form>
        {#if renameError}<p class="error" role="alert">{renameError}</p>{/if}
      {:else}
        <span class="name">{row.name}</span>
        <span class="meta">{row.type} · {row.address}</span>
        <span class="buttons">
          <button type="button" class="small" onclick={() => startRename(row.name)}>{t.servers.rename}</button>
          <button type="button" class="small" onclick={() => remove(row.name)}>{t.servers.remove}</button>
        </span>
      {/if}
      {#if blocked?.name === row.name}
        <p class="error" role="alert">
          {t.servers.blocked}
          {blocked.why.map(blockerText).join('; ')}.
        </p>
      {/if}
    </li>
  {/each}
</ul>

<div class="add">
  <label for="add-links">{t.servers.add} <Info text={t.servers.addInfo} /></label>
  <textarea id="add-links" bind:value={links} placeholder={t.servers.addPlaceholder} spellcheck="false" autocomplete="off"></textarea>
  <div class="actions">
    <button type="button" disabled={links.trim() === ''} onclick={read}>{t.servers.addRead}</button>
  </div>

  {#if parsed}
    {#each parsed.errors as err (err.line)}
      <p class="error">
        {format(t.servers.lineError, { line: err.line, reason: format(t.servers.linkErrors[err.code], { detail: err.detail }) })}
      </p>
    {/each}
    {#if parsed.servers.length > 0}
      <fieldset class="groups">
        <legend>{t.servers.addTo} <Info text={t.servers.addToInfo} /></legend>
        {#each groups as g (g.name)}
          <label>
            <input type="checkbox" checked={addTo.includes(g.name)} onchange={(e) => toggleGroup(g.name, e.currentTarget.checked)} />
            {g.name}
          </label>
        {/each}
      </fieldset>
      <button type="button" class="primary" onclick={add}>{format(t.servers.addButton, { count: parsed.servers.length })}</button>
    {/if}
  {/if}
  {#if addedCount > 0}<p class="ok" role="status">{format(t.servers.added, { count: addedCount })}</p>{/if}
</div>

<style>
  .intro {
    margin: 0 0 0.5rem;
    color: var(--muted);
  }

  .count {
    margin: 0 0 0.5rem;
    font-size: 0.875rem;
    font-weight: 600;
  }

  .servers {
    max-height: 26rem;
    margin: 0 0 1rem;
    padding: 0;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: 6px;
    list-style: none;
    background: var(--surface);
  }

  .servers li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.75rem;
    padding: 0.45rem 0.6rem;
    border-bottom: 1px solid var(--border);
  }

  .servers li:last-child {
    border-bottom: 0;
  }

  .name {
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .meta {
    font-size: 0.8rem;
    color: var(--muted);
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    overflow-wrap: anywhere;
  }

  .buttons {
    display: inline-flex;
    gap: 0.25rem;
    margin-left: auto;
  }

  .small {
    padding: 0.15rem 0.5rem;
    font-size: 0.8rem;
  }

  .rename {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    width: 100%;
  }

  .rename input,
  textarea {
    flex: 1;
    padding: 0.4rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    font: inherit;
    color: var(--text);
    background: var(--surface);
  }

  .error {
    width: 100%;
    margin: 0.25rem 0 0;
    font-size: 0.875rem;
    color: var(--danger);
  }

  .ok {
    color: var(--ok);
  }

  .add label {
    display: block;
    margin-bottom: 0.35rem;
    font-weight: 600;
  }

  textarea {
    display: block;
    width: 100%;
    min-height: 5rem;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 0.85rem;
  }

  .actions {
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
    font-weight: normal;
  }
</style>
