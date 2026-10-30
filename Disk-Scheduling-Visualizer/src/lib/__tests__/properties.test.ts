import { describe, it, expect } from 'vitest';
import { ALGORITHMS, runAlgorithm } from '../algorithms';
import type { Algorithm, Direction, DiskRequest, SeekModel, VisualizerInput } from '@/types';

// Seeded PRNG so every run checks the same 200 workloads.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DISK_SIZE = 200;
const MAX = DISK_SIZE - 1;

function randomInput(rnd: () => number, seekModel: SeekModel, direction: Direction): VisualizerInput {
  const n = Math.floor(rnd() * 21); // 0..20, includes empty queues
  // Small cylinder range sometimes, to force duplicates and head-on-request cases
  const range = rnd() < 0.3 ? 10 : DISK_SIZE;
  const requests: DiskRequest[] = Array.from({ length: n }, (_, id) => ({
    id,
    cylinder: Math.floor(rnd() * range),
    sector: Math.floor(rnd() * 3600) / 10,
    arrivalTime: 0,
  }));
  return {
    requests,
    headStart: Math.floor(rnd() * range),
    diskSize: DISK_SIZE,
    direction,
    rpm: 7200,
    seekRate: 0.1,
    seekModel,
    seekA: 1,
  };
}

function workloads(): VisualizerInput[] {
  const rnd = mulberry32(12345);
  return Array.from({ length: 200 }, (_, i) =>
    randomInput(rnd, i % 2 === 0 ? 'curve' : 'linear', i % 4 < 2 ? 'right' : 'left')
  );
}

describe('Properties over 200 seeded workloads', () => {
  const inputs = workloads();

  it('every request is serviced exactly once, by id', () => {
    for (const input of inputs) {
      const expected = input.requests.map(r => r.id).sort((a, b) => a - b);
      for (const algo of ALGORITHMS) {
        const result = runAlgorithm(algo, input);
        const served = result.steps.filter(s => !s.isBoundary).map(s => s.requestId!).sort((a, b) => a - b);
        expect(served, `${algo}`).toEqual(expected);
      }
    }
  });

  it('sum of step distances equals totalSeekDistance and the last cumulative distance', () => {
    for (const input of inputs) {
      for (const algo of ALGORITHMS) {
        const result = runAlgorithm(algo, input);
        const sum = result.steps.reduce((s, st) => s + st.distance, 0);
        expect(sum).toBe(result.totalSeekDistance);
        const last = result.steps[result.steps.length - 1];
        expect(last ? last.cumulativeDistance : 0).toBe(result.totalSeekDistance);
      }
    }
  });

  it('total seek is at least the distance needed to visit both extremes', () => {
    for (const input of inputs) {
      if (input.requests.length === 0) continue;
      const cyls = input.requests.map(r => r.cylinder);
      const lo = Math.min(...cyls);
      const hi = Math.max(...cyls);
      const h = input.headStart;
      const bound = Math.min(Math.abs(h - lo), Math.abs(h - hi)) + (hi - lo);
      for (const algo of ALGORITHMS) {
        expect(runAlgorithm(algo, input).totalSeekDistance, algo).toBeGreaterThanOrEqual(bound);
      }
    }
  });

  it('LOOK <= SCAN in the same direction', () => {
    for (const input of inputs) {
      expect(runAlgorithm('LOOK', input).totalSeekDistance).toBeLessThanOrEqual(
        runAlgorithm('SCAN', input).totalSeekDistance
      );
    }
  });

  it("each request id gets its own sector in every algorithm", () => {
    for (const input of inputs) {
      const sectorById = new Map(input.requests.map(r => [r.id, r.sector]));
      for (const algo of ALGORITHMS) {
        for (const step of runAlgorithm(algo, input).steps) {
          if (step.isBoundary) {
            expect(step.requestId).toBeNull();
            expect(step.rotationalLatency).toBe(0);
          } else {
            expect(step.sectorAngle).toBe(sectorById.get(step.requestId!));
          }
        }
      }
    }
  });

  it('SATF beats SSTF on total access time in most workloads (curve model)', () => {
    // Greedy SATF is not optimal, so it can lose on some workloads; this measures the trend.
    let wins = 0;
    let losses = 0;
    for (const input of inputs) {
      if (input.seekModel !== 'curve' || input.requests.length < 2) continue;
      const sstf = runAlgorithm('SSTF', input).totalAccessTime;
      const satf = runAlgorithm('SATF', input).totalAccessTime;
      if (satf < sstf - 1e-9) wins++;
      else if (satf > sstf + 1e-9) losses++;
    }
    expect(wins).toBeGreaterThan(losses);
  });
});

describe('Edge cases do not crash and give sensible output', () => {
  const base: VisualizerInput = {
    requests: [],
    headStart: 53,
    diskSize: DISK_SIZE,
    direction: 'right',
    rpm: 7200,
    seekRate: 1,
    seekModel: 'linear',
  };
  const req = (id: number, cylinder: number): DiskRequest => ({ id, cylinder, sector: 0, arrivalTime: 0 });
  const cases: [string, Partial<VisualizerInput>][] = [
    ['empty queue', { requests: [] }],
    ['single request', { requests: [req(0, 120)] }],
    ['duplicates', { requests: [req(0, 70), req(1, 70), req(2, 70)] }],
    ['head on a request', { requests: [req(0, 53), req(1, 90)] }],
    ['head at 0', { headStart: 0, requests: [req(0, 0), req(1, 150)] }],
    ['head at max', { headStart: MAX, requests: [req(0, MAX), req(1, 10)] }],
  ];

  for (const [name, patch] of cases) {
    for (const direction of ['left', 'right'] as Direction[]) {
      it(`${name} (${direction})`, () => {
        const input = { ...base, ...patch, direction };
        for (const algo of ALGORITHMS as Algorithm[]) {
          const result = runAlgorithm(algo, input);
          expect(result.steps.filter(s => !s.isBoundary)).toHaveLength(input.requests.length);
          for (const v of [result.totalSeekDistance, result.seekTime, result.avgSeekDistance, result.totalAccessTime]) {
            expect(Number.isFinite(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(0);
          }
          for (const s of result.steps) {
            expect(s.to).toBeGreaterThanOrEqual(0);
            expect(s.to).toBeLessThanOrEqual(MAX);
          }
        }
      });
    }
  }

  it('empty queue gives all-zero metrics', () => {
    const result = runAlgorithm('SATF', base);
    expect(result.steps).toEqual([]);
    expect(result.totalAccessTime).toBe(0);
  });
});
