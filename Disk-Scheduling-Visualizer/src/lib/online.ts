import type { Algorithm, DiskRequest, VisualizerInput } from '@/types';
import { computePhysicalRotationalLatency, computeSeekTime, maxCylinderOf } from './algorithms';
import { meanCI, type Stat } from './benchmark';
import { generateWorkload, mulberry32, type WorkloadKind } from './workloads';

/**
 * Online simulation: requests arrive over time and each scheduler may only choose among
 * requests that have already arrived. Service is non-preemptive: once the head starts
 * moving to a request, it finishes that request (seek + rotational wait) before choosing again.
 */

export type OnlineAlgorithm = Algorithm | 'FSCAN' | 'N-SCAN';
export const ONLINE_ALGORITHMS: OnlineAlgorithm[] = [
  'FCFS', 'SSTF', 'SSTF-AGE', 'SATF', 'SCAN', 'C-SCAN', 'LOOK', 'FSCAN', 'N-SCAN',
];

export const ONLINE_INFO: Partial<Record<OnlineAlgorithm, string>> = {
  FSCAN: 'Freezes the queue: serves a LOOK sweep over the requests waiting when the sweep began; new arrivals wait for the next sweep.',
  'N-SCAN': 'N-step SCAN: serves the oldest N waiting requests as one LOOK sweep, then takes the next N.',
};

export type ArrivalPattern = 'poisson' | 'bursty';

export interface OnlineOptions {
  nStep?: number; // N for N-step SCAN (default 8)
  starvationFactor?: number; // starved if response > k * own mean response (default 3)
}

export interface ServedRequest {
  id: number;
  cylinder: number;
  arrival: number;
  completion: number;
  response: number; // completion - arrival (ms): queueing + seek + rotation
}

export interface QueueSample {
  time: number;
  depth: number; // requests waiting (arrived, not yet completed)
}

export interface OnlineResult {
  algorithm: OnlineAlgorithm;
  served: ServedRequest[]; // in completion order
  queue: QueueSample[];
  makespan: number;
  meanResponse: number;
  p50: number;
  p95: number;
  p99: number;
  maxResponse: number;
  throughput: number; // requests per second
  fairness: number; // Jain's index over response times, 1 = perfectly even
  starved: number; // count with response > k * mean
  starvationThreshold: number;
  totalSeekDistance: number;
}

/** Nearest-rank percentile on an ascending array. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

/** Jain's fairness index: (sum x)^2 / (n * sum x^2). 1 when all equal, 1/n when one gets everything. */
export function jainIndex(xs: number[]): number {
  if (xs.length === 0) return 1;
  const s = xs.reduce((a, b) => a + b, 0);
  const s2 = xs.reduce((a, b) => a + b * b, 0);
  return s2 === 0 ? 1 : (s * s) / (xs.length * s2);
}

type Dir = 1 | -1;

export function simulateOnline(
  algorithm: OnlineAlgorithm,
  input: VisualizerInput,
  options: OnlineOptions = {}
): OnlineResult {
  const maxCyl = maxCylinderOf(input);
  const all = input.requests
    .filter(r => Number.isInteger(r.cylinder) && r.cylinder >= 0 && r.cylinder <= maxCyl)
    .slice()
    .sort((a, b) => a.arrivalTime - b.arrivalTime || a.id - b.id);
  const alpha = input.agingAlpha ?? 0.5;
  const nStep = Math.max(1, options.nStep ?? 8);
  const k = options.starvationFactor ?? 3;
  const countReturnJump = input.countReturnJump ?? true;

  let t = 0;
  let pos = input.headStart;
  let dir: Dir = input.direction === 'right' ? 1 : -1;
  let next = 0; // index into `all` of the next arrival
  let pending: DiskRequest[] = [];
  let batch: DiskRequest[] = []; // FSCAN / N-SCAN active sweep
  let distance = 0;
  const served: ServedRequest[] = [];
  const queue: QueueSample[] = [{ time: 0, depth: 0 }];

  const admit = () => {
    while (next < all.length && all[next].arrivalTime <= t) {
      pending.push(all[next++]);
      queue.push({ time: all[next - 1].arrivalTime, depth: pending.length + batch.length });
    }
  };
  const moveTo = (cyl: number) => {
    const d = Math.abs(cyl - pos);
    distance += d;
    t += computeSeekTime(d, input);
    pos = cyl;
  };
  const seekCost = (r: DiskRequest) => computeSeekTime(Math.abs(r.cylinder - pos), input);
  const accessCost = (r: DiskRequest) => {
    const arrive = t + seekCost(r);
    return arrive - t + computePhysicalRotationalLatency(r.sector, arrive, input.rpm).latencyMs;
  };
  const argmin = (list: DiskRequest[], f: (r: DiskRequest) => number) => {
    let best = 0;
    let bestV = f(list[0]);
    for (let i = 1; i < list.length; i++) {
      const v = f(list[i]);
      if (v < bestV || (v === bestV && list[i].arrivalTime < list[best].arrivalTime)) {
        best = i;
        bestV = v;
      }
    }
    return best;
  };
  /** Nearest request in the current direction (ties at pos count as ahead), or -1. */
  const nearestAhead = (list: DiskRequest[]) => {
    let best = -1;
    for (let i = 0; i < list.length; i++) {
      const d = (list[i].cylinder - pos) * dir;
      if (d < 0) continue;
      if (best < 0 || d < (list[best].cylinder - pos) * dir) best = i;
    }
    return best;
  };
  /** LOOK sweep step over a list: nearest ahead, reversing when nothing is ahead. */
  const lookPick = (list: DiskRequest[]) => {
    let i = nearestAhead(list);
    if (i < 0) {
      dir = (dir === 1 ? -1 : 1) as Dir;
      i = nearestAhead(list);
    }
    return i;
  };

  while (served.length < all.length) {
    admit();
    if (pending.length === 0 && batch.length === 0) {
      t = Math.max(t, all[next].arrivalTime); // idle until the next arrival
      continue;
    }

    let from: DiskRequest[] = pending;
    let i: number;

    switch (algorithm) {
      case 'FCFS':
        i = argmin(pending, r => r.arrivalTime);
        break;
      case 'SSTF':
        i = argmin(pending, r => Math.abs(r.cylinder - pos));
        break;
      case 'SSTF-AGE':
        i = argmin(pending, r => Math.abs(r.cylinder - pos) - alpha * (t - r.arrivalTime));
        break;
      case 'SATF':
        i = argmin(pending, accessCost);
        break;
      case 'LOOK':
        i = lookPick(pending);
        break;
      case 'SCAN':
        i = nearestAhead(pending);
        if (i < 0) {
          // Nothing ahead: travel to the edge, then reverse
          moveTo(dir === 1 ? maxCyl : 0);
          dir = (dir === 1 ? -1 : 1) as Dir;
          continue;
        }
        break;
      case 'C-SCAN':
        i = nearestAhead(pending);
        if (i < 0) {
          // Nothing ahead: go to the edge, jump to the other edge, keep the same direction
          moveTo(dir === 1 ? maxCyl : 0);
          const other = dir === 1 ? 0 : maxCyl;
          if (countReturnJump) moveTo(other);
          else pos = other;
          continue;
        }
        break;
      case 'FSCAN':
      case 'N-SCAN':
        if (batch.length === 0) {
          // Start a new sweep with the frozen queue (FSCAN) or the oldest N (N-SCAN)
          pending.sort((a, b) => a.arrivalTime - b.arrivalTime || a.id - b.id);
          const take = algorithm === 'FSCAN' ? pending.length : Math.min(nStep, pending.length);
          batch = pending.slice(0, take);
          pending = pending.slice(take);
        }
        from = batch;
        i = lookPick(batch);
        break;
    }

    const r = from.splice(i, 1)[0];
    moveTo(r.cylinder);
    t += computePhysicalRotationalLatency(r.sector, t, input.rpm).latencyMs;
    served.push({ id: r.id, cylinder: r.cylinder, arrival: r.arrivalTime, completion: t, response: t - r.arrivalTime });
    admit();
    queue.push({ time: t, depth: pending.length + batch.length });
  }

  const responses = served.map(s => s.response);
  const sorted = [...responses].sort((a, b) => a - b);
  const mean = responses.length ? responses.reduce((a, b) => a + b, 0) / responses.length : 0;
  const makespan = served.length ? served[served.length - 1].completion : 0;

  return {
    algorithm,
    served,
    queue,
    makespan,
    meanResponse: mean,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    maxResponse: sorted.length ? sorted[sorted.length - 1] : 0,
    throughput: makespan > 0 ? (served.length / makespan) * 1000 : 0,
    fairness: jainIndex(responses),
    starved: responses.filter(x => x > k * mean).length,
    starvationThreshold: k * mean,
    totalSeekDistance: distance,
  };
}

/**
 * Assigns arrival times to a generated workload.
 * Poisson: exponential gaps with the given mean. Bursty: bursts of 5–15 requests 0.2 ms apart,
 * with gaps between bursts chosen so the long-run mean inter-arrival time is the same.
 */
export function generateOnlineWorkload(
  kind: WorkloadKind,
  pattern: ArrivalPattern,
  n: number,
  meanGapMs: number,
  diskSize: number,
  rnd: () => number
): { headStart: number; requests: DiskRequest[] } {
  const w = generateWorkload(kind, n, diskSize, rnd);
  const exp = (mean: number) => -mean * Math.log(1 - rnd());
  let t = 0;
  let left = 0;
  const requests = w.requests.map(r => {
    if (pattern === 'poisson') {
      t += exp(meanGapMs);
    } else {
      if (left === 0) {
        left = 5 + Math.floor(rnd() * 11);
        t += exp(meanGapMs * left); // gap before a burst of `left` requests
      } else {
        t += 0.2;
      }
      left--;
    }
    return { ...r, arrivalTime: t };
  });
  return { headStart: w.headStart, requests };
}

export interface OnlineBenchmarkRow {
  algorithm: OnlineAlgorithm;
  mean: Stat;
  p95: Stat;
  p99: Stat;
  max: Stat;
  fairness: Stat;
  starvedPct: Stat;
  throughput: Stat;
}

export interface OnlineBenchmarkOptions {
  base: VisualizerInput;
  kind: WorkloadKind;
  pattern: ArrivalPattern;
  meanGapMs: number;
  requestsPerRun: number;
  runs: number;
  seed: number;
  options?: OnlineOptions;
}

export function onlineWorkload(opts: OnlineBenchmarkOptions, run: number) {
  return generateOnlineWorkload(
    opts.kind, opts.pattern, opts.requestsPerRun, opts.meanGapMs, opts.base.diskSize,
    mulberry32(opts.seed * 100003 + run)
  );
}

/** Runs every online algorithm on the same seeded arrival streams; each statistic is mean ± 95% CI across runs. */
export function runOnlineBenchmark(
  opts: OnlineBenchmarkOptions,
  algorithms: OnlineAlgorithm[] = ONLINE_ALGORITHMS
): OnlineBenchmarkRow[] {
  const acc = new Map<OnlineAlgorithm, OnlineResult[]>(algorithms.map(a => [a, []]));
  for (let i = 0; i < opts.runs; i++) {
    const w = onlineWorkload(opts, i);
    const input = { ...opts.base, headStart: w.headStart, requests: w.requests };
    for (const a of algorithms) acc.get(a)!.push(simulateOnline(a, input, opts.options));
  }
  return algorithms.map(a => {
    const rs = acc.get(a)!;
    const stat = (f: (r: OnlineResult) => number) => meanCI(rs.map(f));
    return {
      algorithm: a,
      mean: stat(r => r.meanResponse),
      p95: stat(r => r.p95),
      p99: stat(r => r.p99),
      max: stat(r => r.maxResponse),
      fairness: stat(r => r.fairness),
      starvedPct: stat(r => (100 * r.starved) / Math.max(1, r.served.length)),
      throughput: stat(r => r.throughput),
    };
  });
}
