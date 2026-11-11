import { describe, expect, it } from 'vitest';
import { compareConfigs, outputNames } from '..';

const A = ['mode: rule', 'mixed-port: 7890', 'a: 1', 'b: 2', 'c: 3', 'd: 4', 'e: 5', 'rules:', '  - MATCH,Proxy', ''].join('\n');

describe('comparing configs', () => {
  it('shows only what changed, with two lines around it', () => {
    const B = A.replace('mixed-port: 7890', 'mixed-port: 7900').replace('  - MATCH,Proxy', '  - GEOIP,CN,DIRECT\n  - MATCH,Proxy');
    const c = compareConfigs(A, B);
    expect(c.added).toBe(2);
    expect(c.removed).toBe(1);
    expect(c.hunks).toHaveLength(2);
    expect(c.hunks[0]?.lines).toEqual([
      { kind: 'same', text: 'mode: rule', oldNo: 1, newNo: 1 },
      { kind: 'removed', text: 'mixed-port: 7890', oldNo: 2 },
      { kind: 'added', text: 'mixed-port: 7900', newNo: 2 },
      { kind: 'same', text: 'a: 1', oldNo: 3, newNo: 3 },
      { kind: 'same', text: 'b: 2', oldNo: 4, newNo: 4 },
    ]);
    expect(c.hunks[1]?.lines.find((l) => l.kind === 'added')).toEqual({ kind: 'added', text: '  - GEOIP,CN,DIRECT', newNo: 9 });
  });

  it('finds nothing when only the line endings differ', () => {
    const c = compareConfigs(A.replace(/\n/g, '\r\n'), A);
    expect(c).toEqual({ hunks: [], added: 0, removed: 0 });
  });

  it('is quick and exact when a rename touches thousands of lines', () => {
    const rules = Array.from({ length: 6000 }, (_, i) => `  - DOMAIN-SUFFIX,site${i}.example.com,${i % 3 === 0 ? 'Proxy' : 'DIRECT'}`);
    const a = ['mode: rule', 'rules:', ...rules, ''].join('\n');
    const renamed = rules.map((r) => r.replace(/,Proxy$/, ',Main'));
    renamed.splice(100, 0, '  - GEOIP,CN,DIRECT');
    const b = ['mode: rule', 'rules:', ...renamed, ''].join('\n');
    const t0 = performance.now();
    const c = compareConfigs(a, b);
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(c.removed).toBe(2000);
    expect(c.added).toBe(2001);
    // Every line shown is really on that line of its file.
    const al = a.split('\n');
    const bl = b.split('\n');
    for (const h of c.hunks) {
      for (const l of h.lines) {
        if (l.oldNo !== undefined) expect(al[l.oldNo - 1]).toBe(l.text);
        if (l.newNo !== undefined) expect(bl[l.newNo - 1]).toBe(l.text);
      }
    }
  });

  it('always describes the real change (random edits)', () => {
    // With full context, same+added lines rebuild the new file and
    // same+removed lines the old one, whatever the edit.
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const words = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    for (let round = 0; round < 200; round++) {
      const a = Array.from({ length: 5 + rand(40) }, () => words[rand(words.length)] ?? 'a');
      const b = [...a];
      for (let e = 0; e < 1 + rand(6); e++) {
        const at = rand(b.length + 1);
        const what = rand(3);
        if (what === 0) b.splice(at, 0, `new${rand(5)}`);
        else if (what === 1 && b.length > 0) b.splice(Math.min(at, b.length - 1), 1);
        else if (b.length > 0) b[Math.min(at, b.length - 1)] = words[rand(words.length)] ?? 'z';
      }
      const c = compareConfigs(a.join('\n'), b.join('\n'), 1_000_000);
      const lines = c.hunks.flatMap((h) => h.lines);
      if (a.join() === b.join()) {
        expect(lines).toEqual([]);
        continue;
      }
      expect(lines.filter((l) => l.kind !== 'added').map((l) => l.text)).toEqual(a);
      expect(lines.filter((l) => l.kind !== 'removed').map((l) => l.text)).toEqual(b);
    }
  });

  it('names the saved files after the original', () => {
    expect(outputNames({ kind: 'file', name: 'WF_SIMPLE.yaml' })).toEqual({ config: 'WF_SIMPLE (edited).yaml', settings: 'WF_SIMPLE.ccsettings.json' });
    expect(outputNames({ kind: 'paste' })).toEqual({ config: 'config (edited).yaml', settings: 'config.ccsettings.json' });
  });
});
