import { describe, it, expect } from 'vitest';
import { meanCI, rankBy, runBenchmark, benchmarkWorkload } from '../benchmark';
import { generateWorkload, mulberry32, type WorkloadKind } from '../workloads';
import { runAlgorithm } from '../algorithms';
import type { VisualizerInput } from '@/types';

const KINDS: WorkloadKind[] = ['uniform', 'sequential', 'zipf', 'clustered'];

const BASE: VisualizerInput = {
  requests: [],
  headStart: 0,
  diskSize: 200,
  direction: 'right',
  rpm: 7200,
  seekRate: 0.1,
  seekModel: 'curve',
  seekA: 1,
};

describe('Workload generators', () => {
  it('are reproducible: same seed, same workload', () => {
    for (const kind of KINDS) {
      expect(generateWorkload(kind, 20, 200, mulberry32(7))).toEqual(generateWorkload(kind, 20, 200, mulberry32(7)));
      expect(generateWorkload(kind, 20, 200, mulberry32(7))).not.toEqual(generateWorkload(kind, 20, 200, mulberry32(8)));
    }
  });

  it('produce n valid requests with unique ids, cylinders in range and sectors in [0, 360)', () => {
    const rnd = mulberry32(99);
    for (const kind of KINDS) {
      for (let i = 0; i < 50; i++) {
        const w = generateWorkload(kind, 25, 200, rnd);
        expect(w.requests).toHaveLength(25);
        expect(new Set(w.requests.map(r => r.id)).size).toBe(25);
        expect(w.headStart).toBeGreaterThanOrEqual(0);
        expect(w.headStart).toBeLessThanOrEqual(199);
        for (const r of w.requests) {
          expect(Number.isInteger(r.cylinder)).toBe(true);
          expect(r.cylinder).toBeGreaterThanOrEqual(0);
          expect(r.cylinder).toBeLessThanOrEqual(199);
          expect(r.sector).toBeGreaterThanOrEqual(0);
          expect(r.sector).toBeLessThan(360);
        }
      }
    }
  });

  it('clustered workloads are tighter than uniform ones', () => {
    const spread = (kind: WorkloadKind) => {
      const rnd = mulberry32(3);
      let total = 0;
      for (let i = 0; i < 100; i++) {
        const cyls = generateWorkload(kind, 20, 200, rnd).requests.map(r => r.cylinder).sort((a, b) => a - b);
        // Sum of gaps between neighbours, ignoring the largest few (gaps between clusters)
        const gaps = cyls.slice(1).map((c, j) => c - cyls[j]).sort((a, b) => a - b).slice(0, 15);
        total += gaps.reduce((a, b) => a + b, 0);
      }
      return total;
    };
    expect(spread('clustered')).toBeLessThan(spread('uniform') / 2);
  });
});

describe('Statistics', () => {
  it('meanCI matches a hand calculation', () => {
    // values 2, 4, 4, 4, 5, 5, 7, 9: mean 5, sample sd = sqrt(32/7)
    const s = meanCI([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(s.mean).toBe(5);
    expect(s.ci95).toBeCloseTo((1.96 * Math.sqrt(32 / 7)) / Math.sqrt(8), 9);
    expect(meanCI([])).toEqual({ mean: 0, ci95: 0 });
    expect(meanCI([3])).toEqual({ mean: 3, ci95: 0 });
  });

  it('rankBy gives tied values the same rank', () => {
    const rows = [{ v: 5, r: 0 }, { v: 1, r: 0 }, { v: 5, r: 0 }, { v: 9, r: 0 }];
    rankBy(rows, x => x.v, (x, k) => (x.r = k));
    expect(rows.map(x => x.r)).toEqual([2, 1, 2, 4]);
  });
});

describe('Benchmark', () => {
  const opts = { base: BASE, kind: 'uniform' as const, runs: 200, requestsPerRun: 20, seed: 1 };

  it('is deterministic', () => {
    expect(runBenchmark(opts)).toEqual(runBenchmark(opts));
  });

  it('every run has at least one winner, and the leaderboard is sorted by access time', () => {
    const r = runBenchmark(opts);
    expect(r.rows.reduce((s, row) => s + row.wins, 0)).toBeGreaterThanOrEqual(200);
    for (let i = 1; i < r.rows.length; i++) {
      expect(r.rows[i].accessTime.mean).toBeGreaterThanOrEqual(r.rows[i - 1].accessTime.mean);
    }
  });

  it('a replayed run gives the same numbers as inside the benchmark', () => {
    const one = runBenchmark({ ...opts, runs: 1 });
    const w = benchmarkWorkload({ ...opts, diskSize: 200 }, 0);
    const input = { ...BASE, headStart: w.headStart, requests: w.requests };
    for (const row of one.rows) {
      const direct = runAlgorithm(row.algorithm, input);
      expect(row.accessTime.mean).toBe(direct.totalAccessTime);
      expect(row.seekDistance.mean).toBe(direct.totalSeekDistance);
    }
  });

  // The thesis: ranking by seek distance and ranking by access time disagree.
  it.each(KINDS)('%s: SSTF is best by seek distance but SATF is best by access time', kind => {
    const r = runBenchmark({ ...opts, kind });
    const sstf = r.rows.find(x => x.algorithm === 'SSTF')!;
    const satf = r.rows.find(x => x.algorithm === 'SATF')!;
    expect(sstf.rankByDistance).toBe(1);
    expect(satf.rankByTime).toBe(1);
    expect(satf.rankByDistance).toBeGreaterThan(2);
    // Non-overlapping 95% CIs: the difference is not noise
    expect(satf.accessTime.mean + satf.accessTime.ci95).toBeLessThan(sstf.accessTime.mean - sstf.accessTime.ci95);
  });
});
