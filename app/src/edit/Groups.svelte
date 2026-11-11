<!--
  Groups: the choices the user's app shows. Change a group's type and
  members, rename it, remove it (only when nothing uses it), or add one.
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
  const raw = (index: number): Record<string, unknown> => {
    const g = (Array.isArray(data['proxy-groups']) ? data['proxy-groups'] : [])[index];
    return g !== null && typeof g === 'object' ? (g as Record<string, unknown>) : {};
  };

  let openGroup: string | null = $state(null);
  let error = $state('');
  let errorFor: string | null = $state(null);

  /** Makes an edit from a function that may refuse it; shows why if it does. */
  function attempt(owner: string, make: () => Change[]): boolean {
    error = '';
    errorFor = owner;
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

  // Per-group inputs, keyed by group name.
  let adding: Record<string, string> = $state({});
  let renaming: string | null = $state(null);
  let newName = $state('');

  function remove(name: string) {
    const uses = groupUses(data, name);
    if (uses.length > 0) {
      errorFor = name;
      error = format(t.groups.inUse, { uses: uses.map(useText).join(', ') });
      return;
    }
    if (attempt(name, () => removeGroupChanges(data, name))) openGroup = null;
  }

  // The new-group form.
  let createName = $state('');
  let createType: GroupType = $state('select');
  let createMembers: string[] = $state([]);
  const createChoices = $derived([...serverNames(data), ...groups.map((g) => g.name), 'DIRECT', 'REJECT']);

  function create() {
    const name = createName;
    if (attempt('new', () => addGroupChanges(data, { name, type: createType, members: createMembers }))) {
      createName = '';
      createMembers = [];
      openGroup = name;
    }
  }
</script>

<p class="intro">{t.groups.intro}</p>
<p class="count">{format(t.groups.count, { count: groups.length })}</p>

<ul class="groups">
  {#each groups as g (g.name)}
    {@const r = raw(g.index)}
    <li>
      <div class="row">
        <span class="name">{g.name}</span>
        <span class="meta">{typeLabel(g.type)} · {format(t.groups.members, { count: g.members.length })}</span>
        <button type="button" class="small push" aria-expanded={openGroup === g.name} onclick={() => (openGroup = openGroup === g.name ? null : g.name)}>
          {openGroup === g.name ? t.groups.close : t.groups.open}
        </button>
      </div>

      {#if openGroup === g.name}
        <div class="detail">
          <label class="field">
            <span>{t.groups.type} <Info text={t.groups.typeInfo} name="type" /></span>
            <select value={g.type} onchange={(e) => attempt(g.name, () => setGroupTypeChanges(data, g.index, e.currentTarget.value as GroupType))}>
              {#if !(GROUP_TYPES as readonly string[]).includes(g.type)}<option value={g.type} disabled>{typeLabel(g.type)}</option>{/if}
              {#each GROUP_TYPES as type (type)}<option value={type}>{t.groups.types[type]}</option>{/each}
            </select>
          </label>
          {#if hasOtherMembers(r)}<p class="note">{t.groups.alsoFrom}</p>{/if}
          {#if typeof r['filter'] === 'string'}<p class="note">{format(t.groups.filterNote, { filter: r['filter'] })}</p>{/if}

          <ol class="members">
            {#each g.members as m, i (`${i}-${m}`)}
              <li>
                <span>{m}</span>
                <span class="buttons">
                  <button type="button" class="small" aria-label={t.groups.up} disabled={i === 0} onclick={() => attempt(g.name, () => moveMemberChanges(data, g.index, i, i - 1))}>↑</button>
                  <button type="button" class="small" aria-label={t.groups.down} disabled={i === g.members.length - 1} onclick={() => attempt(g.name, () => moveMemberChanges(data, g.index, i, i + 1))}>↓</button>
                  <button type="button" class="small" aria-label={t.groups.removeMember} onclick={() => attempt(g.name, () => removeMemberChanges(data, g.index, i))}>✕</button>
                </span>
              </li>
            {/each}
          </ol>

          <div class="inline">
            <select aria-label={t.groups.addMember} bind:value={adding[g.name]}>
              <option value="">{t.groups.choose}</option>
              {#each memberChoices(data, g.name).filter((c) => !g.members.includes(c)) as c (c)}<option value={c}>{c}</option>{/each}
            </select>
            <button
              type="button"
              disabled={!adding[g.name]}
              onclick={() => {
                const member = adding[g.name];
                if (member && attempt(g.name, () => addMemberChanges(data, g.index, member))) adding[g.name] = '';
              }}>{t.groups.addMember}</button
            >
          </div>

          <div class="inline">
            {#if renaming === g.name}
              <input type="text" bind:value={newName} aria-label={t.groups.newName} />
              <button type="button" class="primary" onclick={() => {
                if (attempt(g.name, () => renameChanges(data, g.name, newName))) { openGroup = newName; renaming = null; }
              }}>{t.edit.save}</button>
              <button type="button" onclick={() => (renaming = null)}>{t.edit.cancel}</button>
            {:else}
              <button type="button" class="small" onclick={() => { renaming = g.name; newName = g.name; }}>{t.groups.rename}</button>
              <button type="button" class="small" onclick={() => remove(g.name)}>{t.groups.remove}</button>
            {/if}
          </div>
        </div>
      {/if}
      {#if errorFor === g.name && error}<p class="error" role="alert">{error}</p>{/if}
    </li>
  {/each}
</ul>

<fieldset class="new">
  <legend>{t.groups.new} <Info text={t.groups.newInfo} /></legend>
  <div class="inline">
    <input type="text" bind:value={createName} placeholder={t.groups.newName} aria-label={t.groups.newName} />
    <select bind:value={createType} aria-label={t.groups.type}>
      {#each GROUP_TYPES as type (type)}<option value={type}>{t.groups.types[type]}</option>{/each}
    </select>
  </div>
  <p class="label">{t.groups.newMembers}</p>
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
  {#if errorFor === 'new' && error}<p class="error" role="alert">{error}</p>{/if}
</fieldset>

<style>
  .intro {
    margin: 0 0 0.5rem;
    color: var(--muted);
  }

  .count,
  .label {
    margin: 0 0 0.5rem;
    font-size: 0.875rem;
    font-weight: 600;
  }

  .groups,
  .members {
    margin: 0 0 1rem;
    padding: 0;
    list-style: none;
  }

  .groups > li {
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    margin-bottom: 0.35rem;
    background: var(--surface);
  }

  .row,
  .members li,
  .inline {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem 0.75rem;
  }

  .name {
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .meta,
  .note {
    font-size: 0.8rem;
    color: var(--muted);
  }

  .push,
  .buttons {
    margin-left: auto;
  }

  .buttons {
    display: inline-flex;
    gap: 0.25rem;
  }

  .detail {
    margin-top: 0.6rem;
    padding-top: 0.6rem;
    border-top: 1px solid var(--border);
  }

  .field {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .members {
    margin: 0.5rem 0;
    max-height: 18rem;
    overflow-y: auto;
  }

  .members li {
    padding: 0.2rem 0;
    border-bottom: 1px solid var(--border);
  }

  .inline {
    margin: 0.5rem 0;
  }

  .small {
    padding: 0.15rem 0.5rem;
    font-size: 0.8rem;
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

  .new {
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .new legend {
    font-weight: 600;
  }

  .choices {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
    gap: 0.2rem 0.75rem;
    max-height: 14rem;
    overflow-y: auto;
    margin-bottom: 0.75rem;
  }

  .choices label {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.875rem;
    overflow-wrap: anywhere;
  }

  .error {
    margin: 0.35rem 0 0;
    font-size: 0.875rem;
    color: var(--danger);
  }
</style>
