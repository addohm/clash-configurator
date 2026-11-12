// @vitest-environment happy-dom
// The update banner, with the app's commands stood in for (the updater
// itself is Tauri's, checked on the owner's PC).
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { format, strings as t } from './i18n';
import UpdateBanner from './lib/UpdateBanner.svelte';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

let target: HTMLElement;
let banner: ReturnType<typeof mount> | undefined;
const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  flushSync();
};
const show = async () => {
  banner = mount(UpdateBanner, { target });
  await settle();
};
const button = (label: string) => [...target.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);

beforeEach(() => {
  (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {};
  invoke.mockReset();
  target = document.createElement('div');
  document.body.appendChild(target);
});

afterEach(() => {
  if (banner) unmount(banner);
  target.remove();
  delete (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'];
});

it('says when a newer version is out, and installs it only when asked', async () => {
  invoke.mockImplementation(async (cmd: string) => (cmd === 'update_check' ? { version: '0.2.0', notes: 'Faster.' } : undefined));
  await show();
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(target.textContent).toContain(format(t.updates.available, { version: '0.2.0' }));
  expect(target.querySelector('pre')?.textContent).toBe('Faster.');
  button(t.updates.install)?.click();
  await settle();
  expect(invoke).toHaveBeenLastCalledWith('update_install');
});

it('says why an update failed', async () => {
  invoke.mockImplementation(async (cmd: string) => {
    if (cmd === 'update_check') return { version: '0.2.0', notes: null };
    throw 'the signature is wrong';
  });
  await show();
  button(t.updates.install)?.click();
  await settle();
  expect(target.textContent).toContain(format(t.updates.failed, { reason: 'the signature is wrong' }));
});

it('shows nothing when there is no update, or the check fails', async () => {
  invoke.mockResolvedValue(null);
  await show();
  expect(target.querySelector('.update')).toBeNull();
  if (banner) unmount(banner);
  invoke.mockRejectedValue('offline');
  await show();
  expect(target.querySelector('.update')).toBeNull();
});
