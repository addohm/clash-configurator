<!--
  Groups, side by side (PLAN.md Q30): the list on the left, the chosen
  group on the right (its type, members, rename and remove), or the form
  for a new one. Both sides scroll in their own panels.
-->
<script lang="ts">
  import {
    addGroupChanges,
    addMemberChanges,
    type Change,
    ChangeError,
    GROUP_TYPES,
    type GroupType,
    type GroupUse,
    groupUses,
    groupsOf,
    hasOtherMembers,
    memberChoices,
    moveMemberChanges,
    removeGroupChanges,
    removeMemberChanges,
    renameChanges,
    serverNames,
    setGroupTypeChanges,
  } from '../../../core/src';
  import { format, strings as t } from '../i18n';
  import Info from '../lib/Info.svelte';
  import { store } from '../lib/store.svelte';

  const data = $derived(store.data);
  const groups = $derived(groupsOf(data));

  /** The group shown on the right, or 'new' for the new-group form. */
  let chosen: string | 'new' | null = $state(null);
  const current = $derived(chosen === null ? groups[0] : groups.find((g) => g.name === chosen));
  const raw = $derived.by(() => {
    const g = current ? (Array.isArray(data['proxy-groups']) ? data['proxy-groups'] : [])[current.index] : null;
    return g !== null && typeof g === 'object' ? (g as Record<string, unknown>) : {};
  });

  let error = $state('');

  /** Makes an edit from a function that may refuse it; shows why if it does. */
  function attempt(make: () => Change[]): boolean {
    error = '';
    try {
      return store.edit(make());
    } catch (e) {
      if (!(e instanceof ChangeError)) throw e;
      error = t.editErrors[e.message as keyof typeof t.editErrors] ?? e.message;
      return false;
    }
  }

  const typeLabel = (type: string) =>
    (GROUP_TYPES as readonly string[]).includes(type) ? t.groups.types[type as GroupType] : format(t.groups.otherType, { type });

  const useText = (u: GroupUse) =>
    u.kind === 'rule'
      ? format(t.groups.useRule, { n: u.index + 1 })
      : u.kind === 'group'
        ? format(t.groups.useGroup, { group: u.group })
        : format(t.groups.useOther, { path: u.path });

  let adding = $state('');
  let renaming = $state(false);
  let newName = $state('');

  function choose(name: string | 'new') {
    chosen = name;
    error = '';
    renaming = false;
    adding = '';
  }

  function remove(name: string) {
    const uses = groupUses(data, name);
    if (uses.length > 0) {
      error = format(t.groups.inUse, { uses: uses.map(useText).join(', ') });
      return;
    }
    if (attempt(() => removeGroupChanges(data, name))) chosen = null;
  }

  // The new-group form.
  let createName = $state('');
  let createType: GroupType = $state('select');
  let createMembers: string[] = $state([]);
  let createQuery = $state('');
  const createChoices = $derived(
    [...serverNames(data), ...groups.map((g) => g.name), 'DIRECT', 'REJECT'].filter((c) => c.toLowerCase().includes(createQuery.trim().toLowerCase())),
  );

  function create() {
    const name = createName;
    if (attempt(() => addGroupChanges(data, { name, type: createType, members: createMembers }))) {
      createName = '';
      createMembers = [];
      chosen = name;
    }
  }
</script>

<p class="intro">{t.groups.intro}</p>

<div class="split">
  <div class="side">
    <div class="side-head">
      <span class="count">{format(t.groups.count, { count: groups.length })}</span>
      <button type="button" class="small" class:active={chosen === 'new'} onclick={() => choose('new')}>+ {t.groups.new}</button>
    </div>
    <ul class="scroll-panel list" aria-label={t.edit.sections.groups}>
      {#each groups as g (g.name)}
        <li>
          <button type="button" class="item" class:active={chosen !== 'new' && current?.name === g.name} aria-current={chosen !== 'new' && current?.name === g.name ? 'true' : undefined} onclick={() => choose(g.name)}>
            <span class="name">{g.name}</span>
            <span class="meta">{typeLabel(g.type)} · {format(t.groups.members, { count: g.members.length })}</span>
          </button>
        </li>
      {/each}
    </ul>
  </div>

  <div class="scroll-panel detail">
    {#if chosen === 'new'}
      <h4>{t.groups.new} <Info text={t.groups.newInfo} /></h4>
      <div class="inline">
        <input type="text" bind:value={createName} placeholder={t.groups.newName} aria-label={t.groups.newName} />
        <select bind:value={createType} aria-label={t.groups.type}>
          {#each GROUP_TYPES as type (type)}<option value={type}>{t.groups.types[type]}</option>{/each}
        </select>
      </div>
      <p class="label">{t.groups.newMembers} ({createMembers.length})</p>
      <input type="search" bind:value={createQuery} placeholder={t.groups.searchMembers} aria-label={t.groups.searchMembers} />
      <div class="choices">
        {#each createChoices as c (c)}
          <label>
            <input
              type="checkbox"
              checked={createMembers.includes(c)}
              onchange={(e) => (createMembers = e.currentTarget.checked ? [...createMembers, c] : createMembers.filter((m) => m !== c))}
            />
            {c}
          </label>
        {/each}
      </div>
      <button type="button" class="primary" disabled={createName.trim() === '' || createMembers.length === 0} onclick={create}>{t.groups.create}</button>
    {:else if current}
      <div class="detail-head">
        {#if renaming}
          <input type="text" bind:value={newName} aria-label={t.groups.newName} />
          <button
            type="button"
            class="primary small"
            onclick={() => {
              const to = newName;
              if (attempt(() => renameChanges(data, current.name, to))) {
                chosen = to;
                renaming = false;
              }
            }}>{t.edit.save}</button
          >
          <button type="button" class="small" onclick={() => (renaming = false)}>{t.edit.cancel}</button>
        {:else}
          <h4>{current.name}</h4>
          <button
            type="button"
            class="small"
            onclick={() => {
              renaming = true;
              newName = current.name;
            }}>{t.groups.rename}</button
          >
          <button type="button" class="small" onclick={() => remove(current.name)}>{t.groups.remove}</button>
        {/if}
      </div>

      <label class="field">
        <span>{t.groups.type} <Info text={t.groups.typeInfo} name="type" /></span>
        <select value={current.type} onchange={(e) => attempt(() => setGroupTypeChanges(data, current.index, e.currentTarget.value as GroupType))}>
          {#if !(GROUP_TYPES as readonly string[]).includes(current.type)}<option value={current.type} disabled>{typeLabel(current.type)}</option>{/if}
          {#each GROUP_TYPES as type (type)}<option value={type}>{t.groups.types[type]}</option>{/each}
        </select>
      </label>
      {#if hasOtherMembers(raw)}<p class="note">{t.groups.alsoFrom}</p>{/if}
      {#if typeof raw['filter'] === 'string'}<p class="note">{format(t.groups.filterNote, { filter: raw['filter'] })}</p>{/if}

      <p class="label">{format(t.groups.members, { count: current.members.length })}</p>
      <ol class="members">
        {#each current.members as m, i (`${i}-${m}`)}
          <li>
            <span class="pos">{i + 1}</span>
            <span class="member">{m}</span>
            <span class="buttons">
              <button type="button" class="small" aria-label={t.groups.up} disabled={i === 0} onclick={() => attempt(() => moveMemberChanges(data, current.index, i, i - 1))}>↑</button>
              <button type="button" class="small" aria-label={t.groups.down} disabled={i === current.members.length - 1} onclick={() => attempt(() => moveMemberChanges(data, current.index, i, i + 1))}>↓</button>
              <button type="button" class="small" aria-label={t.groups.removeMember} onclick={() => attempt(() => removeMemberChanges(data, current.index, i))}>✕</button>
            </span>
          </li>
        {/each}
      </ol>

      <div class="inline">
        <select aria-label={t.groups.addMember} bind:value={adding}>
          <option value="">{t.groups.choose}</option>
          {#each memberChoices(data, current.name).filter((c) => !current.members.includes(c)) as c (c)}<option value={c}>{c}</option>{/each}
        </select>
        <button
          type="button"
          disabled={!adding}
          onclick={() => {
            const member = adding;
            if (member && attempt(() => addMemberChanges(data, current.index, member))) adding = '';
          }}>{t.groups.addMember}</button
        >
      </div>
    {/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </div>
</div>

<style>
  .intro {
    margin: 0 0 0.5rem;
    font-size: 0.9rem;
    color: var(--muted);
  }

  .split {
    display: grid;
    grid-template-columns: minmax(14rem, 22rem) minmax(0, 1fr);
    gap: 0.75rem;
    flex: 1;
    min-height: 0;
  }

  .side {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .side-head,
  .detail-head,
  .inline {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.5rem;
  }

  .side-head {
    justify-content: space-between;
  }

  .count,
  .label {
    margin: 0.5rem 0 0.35rem;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .side-head .count {
    margin: 0;
  }

  .list,
  .members {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.1rem;
    width: 100%;
    border: 0;
    border-bottom: 1px solid var(--border);
    border-radius: 0;
    padding: 0.45rem 0.6rem;
    text-align: left;
    background: transparent;
  }

  .item.active {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    box-shadow: inset 3px 0 0 var(--accent);
  }

  .name {
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .meta,
  .note {
    font-size: 0.78rem;
    color: var(--muted);
  }

  .detail {
    padding: 0.75rem 0.9rem;
  }

  h4 {
    margin: 0;
    font-size: 1rem;
    overflow-wrap: anywhere;
  }

  .detail-head h4 {
    flex: 1;
  }

  .field {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .members li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.2rem 0;
    border-bottom: 1px solid var(--border);
  }

  .pos {
    min-width: 1.75rem;
    font-size: 0.75rem;
    color: var(--muted);
  }

  .member {
    flex: 1;
    font-size: 0.88rem;
    overflow-wrap: anywhere;
  }

  .buttons {
    display: inline-flex;
    gap: 0.25rem;
  }

  .small {
    padding: 0.15rem 0.5rem;
    font-size: 0.8rem;
  }

  .small.active {
    border-color: var(--accent);
  }

  select,
  input[type='text'],
  input[type='search'] {
    padding: 0.35rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    font: inherit;
    color: var(--text);
    background: var(--surface);
  }

  input[type='search'] {
    width: 100%;
    margin-bottom: 0.4rem;
  }

  .choices {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
    gap: 0.2rem 0.75rem;
    margin-bottom: 0.75rem;
  }

  .choices label {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.85rem;
    overflow-wrap: anywhere;
  }

  .error {
    margin: 0.5rem 0 0;
    font-size: 0.875rem;
    color: var(--danger);
  }

  @media (max-width: 760px) {
    .split {
      grid-template-columns: 1fr;
    }
  }
</style>
