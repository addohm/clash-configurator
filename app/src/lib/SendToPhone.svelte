<!--
  Send to phone (PLAN.md Q19): a button by the save buttons. It offers the
  new file(s) on the local Wi-Fi for five minutes and shows a QR code; the
  panel counts down and says when the phone has them. Only in the app.
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { format, strings as t } from '../i18n';
  import Info from './Info.svelte';
  import Qr from './Qr.svelte';
  import { inApp } from './save';
  import { type ShareFile, type SharePage, shareStatus, type ShareStatus, startShare, stopShare } from './share';

  let { files, page }: { files: ShareFile[]; page: SharePage } = $props();

  let started = $state<{ url: string; address: string; addresses: string[] } | null>(null);
  let status = $state<ShareStatus | null>(null);
  let error = $state('');
  let timer: ReturnType<typeof setInterval> | undefined;

  const ended = $derived(status !== null && status.state !== 'running');
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const fetchedNames = $derived(
    status?.state === 'running' ? status.fetched.map((p) => files.find((f) => f.path === p)?.name ?? p) : [],
  );

  async function start(address?: string) {
    error = '';
    stopPolling();
    const r = await startShare(files, page, address);
    if (!r.ok) {
      started = null;
      error = t.share.errors[r.code];
      return;
    }
    started = { url: r.url, address: r.address, addresses: r.addresses };
    status = { state: 'running', secondsLeft: 300, fetched: [] };
    timer = setInterval(poll, 1000);
  }

  async function poll() {
    const s = await shareStatus();
    status = s ?? { state: 'stopped' };
    if (status.state !== 'running') stopPolling();
  }

  function stopPolling() {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  }

  async function stop() {
    stopPolling();
    await stopShare();
    started = null;
    status = null;
  }

  onDestroy(() => {
    // Leaving the review ends it: the files may change after more edits.
    if (started && !ended) void stopShare();
    stopPolling();
  });
</script>

{#if inApp()}
  {#if !started}
    <span class="with-info">
      <button type="button" onclick={() => start()}>{t.share.button}</button>
      <Info text={t.share.info} />
    </span>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  {:else}
    <div class="share" role="region" aria-label={t.share.button}>
      {#if status?.state === 'running'}
        <Qr text={started.url} label={t.share.qrLabel} />
        <div class="steps">
          <p>{t.share.scan}</p>
          <p class="muted">{format(t.share.left, { time: clock(status.secondsLeft) })}</p>
          {#if fetchedNames.length > 0}<p class="ok">{format(t.share.fetched, { names: fetchedNames.join(', ') })}</p>{/if}
          <p class="muted small">{t.share.trouble}</p>
          <p class="url"><code>{started.url}</code></p>
          {#if started.addresses.length > 1}
            <label class="small">
              {t.share.otherAddress}
              <select value={started.address} onchange={(e) => start(e.currentTarget.value)}>
                {#each started.addresses as a (a)}<option value={a}>{a}</option>{/each}
              </select>
            </label>
          {/if}
          <p class="muted small">{t.share.trust}</p>
          <button type="button" onclick={stop}>{t.share.stop}</button>
        </div>
      {:else if status}
        <div class="steps">
          <p class={status.state === 'done' ? 'ok' : 'muted'}>{t.share.ended[status.state]}</p>
          <span>
            <button type="button" onclick={() => start(started?.address)}>{t.share.again}</button>
            <button type="button" onclick={stop}>{t.share.close}</button>
          </span>
        </div>
      {/if}
    </div>
  {/if}
{/if}

<style>
  .with-info {
    display: inline-flex;
    align-items: center;
  }

  .share {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    width: 100%;
    margin-top: 0.75rem;
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
  }

  .steps {
    flex: 1 1 16rem;
  }

  .steps p {
    margin: 0 0 0.5rem;
  }

  .url code {
    overflow-wrap: anywhere;
    user-select: all;
  }

  .small {
    font-size: 0.85rem;
  }

  .muted {
    color: var(--muted);
  }

  .ok {
    color: var(--ok);
  }

  .error {
    color: var(--danger);
  }
</style>
