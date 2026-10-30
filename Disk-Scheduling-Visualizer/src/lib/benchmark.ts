import type { Algorithm, AlgorithmResult, VisualizerInput } from '@/types';
import { ALGORITHMS, runAlgorithm } from './algorithms';
import { generateWorkload, mulberry32, type Workload, type WorkloadKind } from './workloads';

export interface Stat {
  mean: number;
  ci95: number; // half-width of the 95% confidence interval for the mean
}

/** Mean and 95% CI half-width, using the normal approximation (fine for n >= 30). */
export function meanCI(values: number[]): Stat {
  const n = values.length;
  if (n === 0) return { mean: 0, ci95: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  if (n < 2) return { mean, ci95: 0 };
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  return { mean, ci95: (1.96 * Math.sqrt(variance)) / Math.sqrt(n) };
}

export interface BenchmarkRow {
  algorithm: Algorithm;
  accessTime: Stat; // total access time per workload (ms)
  seekDistance: Stat; // total seek distance per workload (cylinders)
  wins: number; // runs where this algorithm had the lowest access time (ties count for each)
  rankByDistance: number; // 1 = lowest mean seek distance
  rankByTime: number; // 1 = lowest mean access time
}

export interface BenchmarkOptions {
  base: VisualizerInput; // physical parameters (seek model, rpm, disk size, direction, ...)
  kind: WorkloadKind;
  runs: number;
  requestsPerRun: number;
  seed: number;
}

export interface BenchmarkResult {
  rows: BenchmarkRow[]; // sorted by mean access time, best first
  runs: number;
}

/** The workload for run i of a benchmark. Each run has its own seed, so any run can be replayed alone. */
export function benchmarkWorkload(opts: Omit<BenchmarkOptions, 'base' | 'runs'> & { diskSize: number }, i: number): Workload {
  return generateWorkload(opts.kind, opts.requestsPerRun, opts.diskSize, mulberry32(opts.seed * 100003 + i));
}

export function runBenchmark(opts: BenchmarkOptions, algorithms: Algorithm[] = ALGORITHMS): BenchmarkResult {
  const access: Record<string, number[]> = {};
  const distance: Record<string, number[]> = {};
  const wins: Record<string, number> = {};
  for (const a of algorithms) {
    access[a] = [];
    distance[a] = [];
    wins[a] = 0;
  }

  for (let i = 0; i < opts.runs; i++) {
    const w = benchmarkWorkload({ ...opts, diskSize: opts.base.diskSize }, i);
    const input: VisualizerInput = { ...opts.base, headStart: w.headStart, requests: w.requests };
    const results: AlgorithmResult[] = algorithms.map(a => runAlgorithm(a, input));
    const best = Math.min(...results.map(r => r.totalAccessTime));
    results.forEach(r => {
      access[r.algorithm].push(r.totalAccessTime);
      distance[r.algorithm].push(r.totalSeekDistance);
      if (r.totalAccessTime <= best + 1e-9) wins[r.algorithm]++;
    });
  }

  const rows = algorithms.map(a => ({
    algorithm: a,
    accessTime: meanCI(access[a]),
    seekDistance: meanCI(distance[a]),
    wins: wins[a],
    rankByDistance: 0,
    rankByTime: 0,
  }));
  rankBy(rows, r => r.seekDistance.mean, (r, k) => (r.rankByDistance = k));
  rankBy(rows, r => r.accessTime.mean, (r, k) => (r.rankByTime = k));
  rows.sort((x, y) => x.rankByTime - y.rankByTime);

  return { rows, runs: opts.runs };
}

/** Assigns ranks 1..n by ascending key; equal keys share a rank. */
export function rankBy<T>(rows: T[], key: (r: T) => number, set: (r: T, rank: number) => void): void {
  const sorted = [...rows].sort((a, b) => key(a) - key(b));
  let rank = 0;
  sorted.forEach((r, i) => {
    if (i === 0 || key(r) - key(sorted[i - 1]) > 1e-9) rank = i + 1;
    set(r, rank);
  });
}
