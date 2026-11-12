// @vitest-environment happy-dom
// Send to phone, with the app's commands stood in for: the Rust side (the
// little server) is tested on its own (sharer/).
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strings as t } from './i18n';
import SendToPhone from './lib/SendToPhone.svelte';
import { sharePlan } from './lib/share';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

const names = { config: 'My (edited).yaml', conf: 'My (edited).conf', servers: 'My (servers).txt' };
const URL_ = 'http://192.168.1.20:50123/0123456789abcdef0123456789abcdef/';

describe('what each app gets', () => {
  it('sends one config to mihomo apps and Stash, with their own button', () => {
    for (const [app, action] of [['mihomo', 'clash'], ['stash', 'stash'], [null, 'clash']] as const) {
      const { files, page } = sharePlan(app, 'mode: rule\n', null, names);
      expect(files).toEqual([{ path: 'config.yaml', name: 'My (edited).yaml', contents: 'mode: rule\n' }]);
      expect(page.buttons.map((b) => [b.action, b.file])).toEqual([[action, 'config.yaml'], ['download', 'config.yaml']]);
    }
  });

  it('sends Shadowrocket its server list and .conf, servers first', () => {
    const { files, page } = sharePlan('shadowrocket', 'mode: rule\n', { conf: '[General]\n', nodes: 'bm9kZXM=', links: [], dropped: [] }, names);
    expect(files.map((f) => [f.path, f.name, f.contents])).toEqual([
      ['servers.txt', 'My (servers).txt', 'bm9kZXM='],
      ['config.conf', 'My (edited).conf', '[General]\n'],
    ]);
    expect(page.buttons.map((b) => b.action)).toEqual(['shadowrocket-servers', 'shadowrocket-config', 'download', 'download']);
  });
});

describe('the panel', () => {
  let target: HTMLElement;
  let panel: ReturnType<typeof mount>;
  const plan = sharePlan('mihomo', 'mode: rule\n', null, names);
  const button = (label: string) => [...target.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
  const settle = async () => {
    for (let i = 0; i < 3; i++) await Promise.resolve();
    flushSync();
  };

  beforeEach(() => {
    vi.useFakeTimers();
    (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {};
    invoke.mockReset();
    target = document.createElement('div');
    document.body.appendChild(target);
    panel = mount(SendToPhone, { target, props: plan });
    flushSync();
  });

  afterEach(() => {
    unmount(panel);
    target.remove();
    delete (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'];
    vi.useRealTimers();
  });

  it('shows a QR code, counts down, and says when the phone has the file', async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'share_start') return { url: URL_, address: '192.168.1.20', addresses: ['192.168.1.20', '10.0.0.5'] };
      if (cmd === 'share_status') return { state: 'running', secondsLeft: 241, fetched: ['config.yaml'] };
    });
    button(t.share.button)?.click();
    await settle();
    expect(invoke).toHaveBeenCalledWith('share_start', { files: plan.files, page: plan.page, address: null });
    expect(target.querySelector('svg.qr path')?.getAttribute('d')).toMatch(/^M\d+ \d+h1v1h-1z/);
    expect(target.textContent).toContain(URL_);
    expect(target.querySelectorAll('select option')).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(1000);
    flushSync();
    expect(target.textContent).toContain('Open for 4:01 more.');
    expect(target.textContent).toContain('Your phone fetched: My (edited).yaml.');

    invoke.mockImplementation(async () => ({ state: 'done' }));
    await vi.advanceTimersByTimeAsync(1000);
    flushSync();
    expect(target.textContent).toContain(t.share.ended.done);
    expect(target.querySelector('svg.qr')).toBeNull();
  });

  it("says why it couldn't start", async () => {
    invoke.mockRejectedValue('no-network');
    button(t.share.button)?.click();
    await settle();
    expect(target.textContent).toContain(t.share.errors['no-network']);
  });

  it('stops when asked', async () => {
    invoke.mockImplementation(async (cmd: string) => (cmd === 'share_start' ? { url: URL_, address: '192.168.1.20', addresses: ['192.168.1.20'] } : null));
    button(t.share.button)?.click();
    await settle();
    expect(target.querySelector('select')).toBeNull();
    button(t.share.stop)?.click();
    await settle();
    expect(invoke).toHaveBeenLastCalledWith('share_stop');
    expect(button(t.share.button)).toBeTruthy();
  });
});
