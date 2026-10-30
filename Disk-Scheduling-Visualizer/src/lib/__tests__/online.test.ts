import { describe, it, expect } from 'vitest';
import {
  ONLINE_ALGORITHMS, generateOnlineWorkload, jainIndex, percentile, runOnlineBenchmark, simulateOnline,
  type OnlineAlgorithm,
} from '../online';
import { runAlgorithm } from '../algorithms';
import { mulberry32 } from '../workloads';
import type { Algorithm, DiskRequest, VisualizerInput } from '@/types';

const BASE: VisualizerInput = {
  requests: [],
  headStart: 100,
  diskSize: 200,
  direction: 'right',
  rpm: 7200,
  seekRate: 0.1,
  seekModel: 'curve',
  seekA: 1,
  agingAlpha: 0.5,
};

const req = (id: number, cylinder: number, arrivalTime: number, sector = 0): DiskRequest => ({ id, cylinder, sector, arrivalTime });
const NO_ROTATION = { rpm: 0, seekModel: 'linear' as const, seekRate: 1 };

describe('Statistics helpers', () => {
  it('percentile uses nearest rank', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(xs, 50)).toBe(5);
    expect(percentile(xs, 95)).toBe(10);
    expect(percentile(xs, 10)).toBe(1);
    expect(percentile([], 99)).toBe(0);
  });

  it('Jain index is 1 for equal values and 1/n when one value takes everything', () => {
    expect(jainIndex([4, 4, 4, 4])).toBe(1);
    expect(jainIndex([10, 0, 0, 0, 0])).toBeCloseTo(1 / 5, 12);
  });
});

describe('Online simulation invariants', () => {
  const rnd = mulberry32(5);
  const streams = Array.from({ length: 30 }, (_, i) =>
    generateOnlineWorkload(i % 2 ? 'uniform' : 'clustered', i % 3 ? 'poisson' : 'bursty', 60, 10 + (i % 4) * 5, 200, rnd)
  );

  it('every request is served once, never before it arrives, and the clock only moves forward', () => {
    for (const w of streams) {
      const input = { ...BASE, headStart: w.headStart, requests: w.requests };
      for (const a of ONLINE_ALGORITHMS) {
        const r = simulateOnline(a, input);
        expect(r.served.map(s => s.id).sort((x, y) => x - y), a).toEqual(w.requests.map(q => q.id));
        let last = 0;
        for (const s of r.served) {
          expect(s.completion).toBeGreaterThanOrEqual(s.arrival);
          expect(s.completion).toBeGreaterThanOrEqual(last);
          expect(s.response).toBeCloseTo(s.completion - s.arrival, 9);
          last = s.completion;
        }
        expect(r.p50).toBeLessThanOrEqual(r.p95);
        expect(r.p95).toBeLessThanOrEqual(r.p99);
        expect(r.p99).toBeLessThanOrEqual(r.maxResponse);
        expect(r.fairness).toBeGreaterThan(0);
        expect(r.fairness).toBeLessThanOrEqual(1 + 1e-12);
      }
    }
  });

  it('FCFS serves strictly in arrival order', () => {
    const w = streams[0];
    const r = simulateOnline('FCFS', { ...BASE, headStart: w.headStart, requests: w.requests });
    const arrivals = r.served.map(s => s.arrival);
    expect(arrivals).toEqual([...arrivals].sort((a, b) => a - b));
  });

  it('with everything arriving at t = 0 it matches the static scheduler (FCFS, SSTF, SATF, LOOK)', () => {
    const requests = [98, 183, 37, 122, 14, 124, 65, 67].map((c, i) => req(i, c, 0, (i * 47) % 360));
    const input = { ...BASE, headStart: 53, requests };
    for (const a of ['FCFS', 'SSTF', 'SATF', 'LOOK'] as Algorithm[]) {
      const online = simulateOnline(a, input);
      const staticRun = runAlgorithm(a, input);
      expect(online.served.map(s => s.cylinder), a).toEqual(staticRun.serviceOrder);
      expect(online.makespan).toBeCloseTo(staticRun.totalAccessTime, 9);
    }
  });

  it('cannot pick a request before it arrives', () => {
    // Head at 100. A near request (101) arrives late; a far one (10) is already waiting.
    const input = { ...BASE, ...NO_ROTATION, requests: [req(0, 10, 0), req(1, 101, 50)] };
    expect(simulateOnline('SSTF', input).served.map(s => s.id)).toEqual([0, 1]);
  });

  it('idles until the first arrival', () => {
    const input = { ...BASE, ...NO_ROTATION, headStart: 0, requests: [req(0, 5, 100)] };
    const r = simulateOnline('FCFS', input);
    expect(r.served[0].completion).toBe(105);
    expect(r.served[0].response).toBe(5);
  });

  it('FSCAN holds back requests that arrive during a sweep', () => {
    // Linear 1 ms/cyl, no rotation. Head 0 sweeping right; 50 and 100 waiting at t = 0.
    // A request for 70 arrives at t = 10, while the head is on its way to 50.
    // LOOK picks it up on the way to 100; FSCAN froze the queue at t = 0, so 70 waits for the next sweep.
    const input = { ...BASE, ...NO_ROTATION, headStart: 0, requests: [req(0, 50, 0), req(1, 100, 0), req(2, 70, 10)] };
    expect(simulateOnline('LOOK', input).served.map(s => s.cylinder)).toEqual([50, 70, 100]);
    expect(simulateOnline('FSCAN', input).served.map(s => s.cylinder)).toEqual([50, 100, 70]);
  });

  it('N-SCAN with N = 1 is FCFS', () => {
    const w = streams[1];
    const input = { ...BASE, headStart: w.headStart, requests: w.requests };
    expect(simulateOnline('N-SCAN', input, { nStep: 1 }).served.map(s => s.id))
      .toEqual(simulateOnline('FCFS', input).served.map(s => s.id));
  });

  it('SSTF-AGE with alpha = 0 is SSTF', () => {
    const w = streams[2];
    const input = { ...BASE, headStart: w.headStart, requests: w.requests };
    expect(simulateOnline('SSTF-AGE', { ...input, agingAlpha: 0 }).served.map(s => s.id))
      .toEqual(simulateOnline('SSTF', input).served.map(s => s.id));
  });
});

describe('Online benchmark (busy disk: Poisson, mean gap 16 ms, 20 x 300 requests)', () => {
  const opts = { base: BASE, kind: 'uniform' as const, pattern: 'poisson' as const, meanGapMs: 16, requestsPerRun: 300, runs: 20, seed: 1 };
  const rows = runOnlineBenchmark(opts);
  const get = (a: OnlineAlgorithm) => rows.find(r => r.algorithm === a)!;

  it('is deterministic', () => {
    expect(runOnlineBenchmark(opts)).toEqual(rows);
  });

  it('SATF has the lowest mean response, but not the lowest worst case', () => {
    expect(get('SATF').mean.mean).toBe(Math.min(...rows.map(r => r.mean.mean)));
    expect(get('SATF').max.mean).toBeGreaterThan(Math.min(...rows.map(r => r.max.mean)));
  });

  it('aging cuts SSTF tail latency at a small cost in mean', () => {
    expect(get('SSTF-AGE').p99.mean).toBeLessThan(get('SSTF').p99.mean);
    expect(get('SSTF-AGE').max.mean).toBeLessThan(get('SSTF').max.mean);
    expect(get('SSTF-AGE').mean.mean).toBeGreaterThanOrEqual(get('SSTF').mean.mean);
  });

  it('FSCAN has a lower worst case than SSTF', () => {
    expect(get('FSCAN').max.mean).toBeLessThan(get('SSTF').max.mean);
  });
});
