import { useMemo, useState } from 'react';
import { NumberField } from './NumberField';
import type { VisualizerInput } from '@/types';
import {
  ONLINE_INFO, onlineWorkload, runOnlineBenchmark, simulateOnline,
  type ArrivalPattern, type OnlineAlgorithm, type OnlineBenchmarkRow,
} from '@/lib/online';
import { WORKLOAD_INFO, type WorkloadKind } from '@/lib/workloads';
import { ALGORITHM_INFO } from '@/lib/algorithms';
import { ALGO_COLORS } from '@/lib/palette';
import { OnlineCharts } from './OnlineCharts';

interface Props {
  input: VisualizerInput;
}

const RUNS = 20;
const REQUESTS = 300;
const COLORS: Record<OnlineAlgorithm, string> = { ...ALGO_COLORS, FSCAN: '#14b8a6', 'N-SCAN': '#e879f9' };

type Col = { key: keyof OnlineBenchmarkRow; label: string; digits: number; higherIsBetter?: boolean };
const COLS: Col[] = [
  { key: 'mean', label: 'Mean', digits: 1 },
  { key: 'p95', label: 'p95', digits: 1 },
  { key: 'p99', label: 'p99', digits: 1 },
  { key: 'max', label: 'Max', digits: 1 },
  { key: 'fairness', label: 'Fairness', digits: 2, higherIsBetter: true },
  { key: 'starvedPct', label: 'Starved %', digits: 1 },
  { key: 'throughput', label: 'Req/s', digits: 0, higherIsBetter: true },
];

export function OnlinePanel({ input }: Props) {
  const [kind, setKind] = useState<WorkloadKind>('uniform');
  const [pattern, setPattern] = useState<ArrivalPattern>('poisson');
  const [meanGapMs, setMeanGapMs] = useState(16);
  const [alpha, setAlpha] = useState(0.5);
  const [nStep, setNStep] = useState(8);
  const [seed, setSeed] = useState(1);
  const [selected, setSelected] = useState<OnlineAlgorithm>('SSTF');

  const { diskSize, direction, rpm, seekRate, seekModel, seekA, countReturnJump } = input;
  const opts = useMemo(() => ({
    base: {
      requests: [], headStart: 0, diskSize, direction, rpm, seekRate, seekModel, seekA, countReturnJump, agingAlpha: alpha,
    } as VisualizerInput,
    kind, pattern, meanGapMs, requestsPerRun: REQUESTS, runs: RUNS, seed, options: { nStep },
  }), [diskSize, direction, rpm, seekRate, seekModel, seekA, countReturnJump, alpha, kind, pattern, meanGapMs, seed, nStep]);

  const rows = useMemo(() => runOnlineBenchmark(opts), [opts]);
  const sample = useMemo(() => {
    const w = onlineWorkload(opts, 0);
    return simulateOnline(selected, { ...opts.base, headStart: w.headStart, requests: w.requests }, opts.options);
  }, [opts, selected]);

  const best = (c: Col) => {
    const vals = rows.map(r => (r[c.key] as { mean: number }).mean);
    return c.higherIsBetter ? Math.max(...vals) : Math.min(...vals);
  };
  const bestMean = [...rows].sort((a, b) => a.mean.mean - b.mean.mean)[0];
  const bestMax = [...rows].sort((a, b) => a.max.mean - b.max.mean)[0];
  const sstf = rows.find(r => r.algorithm === 'SSTF')!;

  const label = 'text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider flex flex-col gap-1';
  const chip = (active: boolean) => ({
    background: active ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.03)',
    border: `1px solid ${active ? 'rgba(6,182,212,0.4)' : 'rgba(255,255,255,0.06)'}`,
    color: active ? 'var(--accent-bright)' : 'var(--text-muted)',
  });

  return (
    <div className="card p-5 lg:p-6">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-bright)]" style={{ boxShadow: '0 0 6px var(--accent-glow)' }} />
        <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-[0.15em]">Online: Requests Arriving Over Time</h3>
      </div>
      <p className="text-[11px] text-[var(--text-muted)] mb-4 leading-relaxed">
        Requests arrive while the disk is busy, and each algorithm can only choose among requests that have already
        arrived. Response time = waiting in the queue + seek + rotation. {RUNS} seeded runs of {REQUESTS} requests;
        each figure is the mean across runs, ± 95% CI on hover. Disk settings come from the left panel.
      </p>

      <div className="flex flex-wrap items-end gap-4 mb-4">
        <div className={label}>
          Arrivals
          <span className="flex gap-1">
            {(['poisson', 'bursty'] as ArrivalPattern[]).map(p => (
              <button key={p} onClick={() => setPattern(p)} className="px-3 py-2 rounded-lg text-[11px] font-semibold capitalize" style={chip(pattern === p)}>{p}</button>
            ))}
          </span>
        </div>
        <div className={label}>
          Cylinders
          <span className="flex gap-1 flex-wrap">
            {(Object.keys(WORKLOAD_INFO) as WorkloadKind[]).map(k => (
              <button key={k} onClick={() => setKind(k)} className="px-3 py-2 rounded-lg text-[11px] font-semibold" style={chip(kind === k)}>{WORKLOAD_INFO[k].label}</button>
            ))}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <label className={label}>
          <span className="flex justify-between">Mean gap between arrivals <span className="font-mono text-[var(--accent-bright)] normal-case">{meanGapMs} ms ({(1000 / meanGapMs).toFixed(0)} req/s)</span></span>
          <input type="range" min={8} max={40} step={1} value={meanGapMs} onChange={e => setMeanGapMs(parseInt(e.target.value))} />
        </label>
        <label className={label}>
          <span className="flex justify-between">SSTF-AGE weight α <span className="font-mono text-[var(--accent-bright)] normal-case">{alpha} cyl/ms</span></span>
          <input type="range" min={0} max={2} step={0.05} value={alpha} onChange={e => setAlpha(parseFloat(e.target.value))} />
        </label>
        <label className={label}>
          <span className="flex justify-between">N for N-SCAN <span className="font-mono text-[var(--accent-bright)]">{nStep}</span></span>
          <input type="range" min={1} max={40} step={1} value={nStep} onChange={e => setNStep(parseInt(e.target.value))} />
        </label>
        <label className={label}>
          Seed
          <NumberField ariaLabel="Seed" min={0} max={1000000} value={seed} onChange={setSeed}
            className="px-3 py-2 rounded-lg text-xs font-mono focus:outline-none w-24"
            style={{ background: 'rgba(8,13,26,0.6)', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-primary)' }} />
        </label>
      </div>

      <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5 mb-4 text-[11px] text-[var(--text-secondary)] leading-relaxed">
        Lowest mean response: <b style={{ color: COLORS[bestMean.algorithm] }}>{bestMean.algorithm}</b> ({bestMean.mean.mean.toFixed(1)} ms).
        Lowest worst case: <b style={{ color: COLORS[bestMax.algorithm] }}>{bestMax.algorithm}</b> ({bestMax.max.mean.toFixed(1)} ms).
        {bestMean.algorithm !== bestMax.algorithm && ' Optimizing the average and protecting the worst-off request are different goals.'}
        {' '}SSTF's worst request waits {(sstf.max.mean / sstf.mean.mean).toFixed(1)}× its average.
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/5 mb-5">
        <table className="w-full text-sm">
          <thead style={{ background: 'var(--bg-elevated)' }}>
            <tr>
              <th className="px-3 py-3 text-left text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Algorithm</th>
              {COLS.map(c => (
                <th key={c.key} className="px-3 py-3 text-right text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  {c.label}{['mean', 'p95', 'p99', 'max'].includes(c.key) ? ' ms' : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.algorithm} onClick={() => setSelected(r.algorithm)}
                className="border-t border-white/5 cursor-pointer hover:bg-white/[0.03] font-mono text-[11px] text-[var(--text-secondary)]"
                style={{ background: r.algorithm === selected ? 'rgba(6,182,212,0.08)' : undefined }}>
                <td className="px-3 py-2.5 font-bold" style={{ color: COLORS[r.algorithm] }}>{r.algorithm}</td>
                {COLS.map(c => {
                  const s = r[c.key] as { mean: number; ci95: number };
                  const isBest = Math.abs(s.mean - best(c)) < 1e-9;
                  return (
                    <td key={c.key} className="px-3 py-2.5 text-right" title={`± ${s.ci95.toFixed(c.digits + 1)} (95% CI)`}
                      style={{ color: isBest ? 'var(--accent-bright)' : undefined, fontWeight: isBest ? 700 : undefined }}>
                      {s.mean.toFixed(c.digits)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs font-bold text-[var(--text-secondary)]">
          Run #1 under <span style={{ color: COLORS[selected] }}>{selected}</span>
          <span className="font-normal text-[var(--text-muted)]"> · click a row above to switch</span>
        </span>
        <span className="text-[10px] font-mono text-[var(--text-muted)]">
          mean {sample.meanResponse.toFixed(1)} · p99 {sample.p99.toFixed(1)} · max {sample.maxResponse.toFixed(1)} ms
        </span>
      </div>
      <p className="text-[10px] text-[var(--text-muted)] mb-3">
        {ONLINE_INFO[selected] ?? ALGORITHM_INFO[selected as keyof typeof ALGORITHM_INFO]?.description}
      </p>
      <OnlineCharts result={sample} color={COLORS[selected]} />

      <p className="text-[10px] text-[var(--text-muted)] mt-4 leading-relaxed">
        Starved = response time above 3× that algorithm's own mean, so it measures how uneven the treatment is, not
        how slow the algorithm is overall. Fairness is Jain's index over response times (1 = everyone waits the same).
        Below ~15 ms between arrivals the disk is overloaded and FCFS's queue grows without limit.
      </p>
    </div>
  );
}
