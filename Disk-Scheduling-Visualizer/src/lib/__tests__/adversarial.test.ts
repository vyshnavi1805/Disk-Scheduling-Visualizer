import { describe, it, expect } from 'vitest';
import { findAdversarialWorkload, scoreWorkload, type AdversarialOptions } from '../adversarial';
import { runAlgorithm } from '../algorithms';
import type { VisualizerInput } from '@/types';

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

const opts = (o: Partial<AdversarialOptions>): AdversarialOptions => ({
  base: BASE, victim: 'SSTF', reference: 'SATF', metric: 'access', requests: 8, seed: 1, ...o,
});

describe('Adversarial workload finder', () => {
  it('is deterministic for a seed', () => {
    expect(findAdversarialWorkload(opts({}))).toEqual(findAdversarialWorkload(opts({})));
  });

  it('reports a ratio that matches running both algorithms on the returned workload', () => {
    const r = findAdversarialWorkload(opts({}));
    const input = { ...BASE, headStart: r.workload.headStart, requests: r.workload.requests };
    const a = runAlgorithm('SSTF', input).totalAccessTime;
    const b = runAlgorithm('SATF', input).totalAccessTime;
    expect(r.costVictim).toBe(a);
    expect(r.costReference).toBe(b);
    expect(r.ratio).toBeCloseTo(a / b, 12);
  });

  it('never ends below where it started, and returns a valid workload', () => {
    for (const [victim, reference] of [['SSTF', 'LOOK'], ['SATF', 'FCFS'], ['C-SCAN', 'SCAN']] as const) {
      const r = findAdversarialWorkload(opts({ victim, reference, metric: 'distance', requests: 12 }));
      expect(r.ratio).toBeGreaterThanOrEqual(r.startRatio);
      expect(r.workload.requests).toHaveLength(12);
      expect(r.workload.requests.map(q => q.id)).toEqual([...Array(12).keys()]);
      for (const q of r.workload.requests) {
        expect(q.cylinder).toBeGreaterThanOrEqual(0);
        expect(q.cylinder).toBeLessThanOrEqual(199);
        expect(q.sector).toBeGreaterThanOrEqual(0);
        expect(q.sector).toBeLessThan(360);
      }
    }
  });

  it('comparing an algorithm with itself gives exactly 1', () => {
    expect(findAdversarialWorkload(opts({ victim: 'LOOK', reference: 'LOOK', evaluations: 400 })).ratio).toBe(1);
  });

  it('a zero-cost reference scores 0 instead of dividing by zero', () => {
    const w = { headStart: 50, requests: [{ id: 0, cylinder: 50, sector: 0, arrivalTime: 0 }] };
    expect(scoreWorkload(w, opts({ victim: 'FCFS', reference: 'SSTF', metric: 'distance' }))).toBe(0);
  });

  // Known results the search should rediscover
  it('finds the FCFS ping-pong worst case: FCFS costs about n times SSTF', () => {
    const r = findAdversarialWorkload(opts({ victim: 'FCFS', reference: 'SSTF', metric: 'distance', requests: 8 }));
    expect(r.ratio).toBeGreaterThanOrEqual(0.9 * 8);
  });

  it('finds a workload where SSTF is far slower than SATF (rotation ignored)', () => {
    expect(findAdversarialWorkload(opts({})).ratio).toBeGreaterThan(3);
  });

  it('finds a workload where greedy SATF loses to SSTF', () => {
    expect(findAdversarialWorkload(opts({ victim: 'SATF', reference: 'SSTF' })).ratio).toBeGreaterThan(1.1);
  });
});
