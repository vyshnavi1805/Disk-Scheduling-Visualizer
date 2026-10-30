import type { Algorithm, DiskRequest, VisualizerInput } from '@/types';
import { runAlgorithm } from './algorithms';
import { generateWorkload, mulberry32, type Workload, type WorkloadKind } from './workloads';

export type CostMetric = 'access' | 'distance';

export interface AdversarialOptions {
  base: VisualizerInput; // physical parameters (seek model, rpm, disk size, direction, ...)
  victim: Algorithm; // A: the algorithm we want to look bad
  reference: Algorithm; // B: the algorithm it is compared against
  metric: CostMetric;
  requests: number; // workload size, fixed during the search
  seed: number;
  evaluations?: number; // total workloads tried (default 4000)
  restarts?: number; // independent hill climbs (default 4)
}

export interface AdversarialResult {
  workload: Workload;
  ratio: number; // cost(A) / cost(B) on the found workload
  costVictim: number;
  costReference: number;
  startRatio: number; // best ratio among the random starting workloads, before climbing
  evaluations: number;
}

const KINDS: WorkloadKind[] = ['uniform', 'sequential', 'zipf', 'clustered'];

function cost(algo: Algorithm, w: Workload, opts: AdversarialOptions): number {
  const r = runAlgorithm(algo, { ...opts.base, headStart: w.headStart, requests: w.requests });
  return opts.metric === 'access' ? r.totalAccessTime : r.totalSeekDistance;
}

/** cost(A) / cost(B). A zero-cost reference makes the ratio meaningless, so such workloads score 0. */
export function scoreWorkload(w: Workload, opts: AdversarialOptions): number {
  const b = cost(opts.reference, w, opts);
  return b > 1e-9 ? cost(opts.victim, w, opts) / b : 0;
}

/** One random local change. Ids stay 0..n-1 in queue order, so FCFS order can also be mutated. */
function mutate(w: Workload, maxCyl: number, rnd: () => number): Workload {
  const reqs: DiskRequest[] = w.requests.map(r => ({ ...r }));
  let head = w.headStart;
  const i = Math.floor(rnd() * reqs.length);
  const clamp = (v: number) => Math.min(maxCyl, Math.max(0, Math.round(v)));
  const u = rnd();

  if (u < 0.35) {
    reqs[i].cylinder = clamp(reqs[i].cylinder + (rnd() < 0.5 ? -1 : 1) * (1 + Math.floor(rnd() * 10)));
  } else if (u < 0.5) {
    reqs[i].cylinder = Math.floor(rnd() * (maxCyl + 1));
  } else if (u < 0.6) {
    reqs[i].sector = Math.floor(rnd() * 3600) / 10;
  } else if (u < 0.7) {
    reqs[i].sector = (((reqs[i].sector + (rnd() - 0.5) * 60) % 360) + 360) % 360;
  } else if (u < 0.8) {
    head = rnd() < 0.5 ? clamp(head + (rnd() - 0.5) * 20) : Math.floor(rnd() * (maxCyl + 1));
  } else if (u < 0.9) {
    // Swap queue positions (contents move, ids stay in order)
    const j = Math.floor(rnd() * reqs.length);
    [reqs[i].cylinder, reqs[j].cylinder] = [reqs[j].cylinder, reqs[i].cylinder];
    [reqs[i].sector, reqs[j].sector] = [reqs[j].sector, reqs[i].sector];
  } else {
    // Copy another request's cylinder: builds duplicates and clusters
    reqs[i].cylinder = reqs[Math.floor(rnd() * reqs.length)].cylinder;
  }
  return { headStart: head, requests: reqs };
}

/**
 * Searches for a workload that maximizes cost(A) / cost(B).
 * Random-restart hill climbing: each climb starts from the best of 25 generated workloads
 * and accepts any mutation that does not lower the ratio (sideways moves let it cross plateaus).
 * It finds a bad case, not necessarily the worst one.
 */
export function findAdversarialWorkload(opts: AdversarialOptions): AdversarialResult {
  const rnd = mulberry32(opts.seed);
  const maxCyl = Math.max(0, opts.base.diskSize - 1);
  const n = Math.max(1, opts.requests);
  const total = opts.evaluations ?? 4000;
  const restarts = Math.max(1, opts.restarts ?? 4);
  const perClimb = Math.floor(total / restarts);

  let best: Workload | null = null;
  let bestScore = -Infinity;
  let startRatio = -Infinity;
  let used = 0;

  for (let c = 0; c < restarts; c++) {
    let cur: Workload = generateWorkload('uniform', n, opts.base.diskSize, rnd);
    let curScore = scoreWorkload(cur, opts);
    for (let k = 0; k < 25; k++) {
      const w = generateWorkload(KINDS[k % KINDS.length], n, opts.base.diskSize, rnd);
      const s = scoreWorkload(w, opts);
      if (s > curScore) {
        cur = w;
        curScore = s;
      }
    }
    used += 26;
    startRatio = Math.max(startRatio, curScore);

    for (let k = 0; k < perClimb - 26; k++) {
      const next = mutate(cur, maxCyl, rnd);
      const s = scoreWorkload(next, opts);
      used++;
      if (s >= curScore) {
        cur = next;
        curScore = s;
      }
    }

    if (curScore > bestScore) {
      best = cur;
      bestScore = curScore;
    }
  }

  const workload = best!;
  return {
    workload,
    ratio: bestScore,
    costVictim: cost(opts.victim, workload, opts),
    costReference: cost(opts.reference, workload, opts),
    startRatio,
    evaluations: used,
  };
}
