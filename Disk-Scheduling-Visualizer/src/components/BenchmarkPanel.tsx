import { useMemo, useState } from 'react';
import { NumberField } from './NumberField';
import type { VisualizerInput } from '@/types';
import { benchmarkWorkload, runBenchmark } from '@/lib/benchmark';
import { WORKLOAD_INFO, type Workload, type WorkloadKind } from '@/lib/workloads';
import { ALGO_COLORS } from '@/lib/palette';

interface Props {
  input: VisualizerInput;
  onLoadWorkload: (w: Workload) => void;
}

const RUNS = 200;
const KINDS = Object.keys(WORKLOAD_INFO) as WorkloadKind[];

export function BenchmarkPanel({ input, onLoadWorkload }: Props) {
  const [kind, setKind] = useState<WorkloadKind>('uniform');
  const [requestsPerRun, setRequestsPerRun] = useState(20);
  const [seed, setSeed] = useState(1);
  const [sampleRun, setSampleRun] = useState(1);

  // Only the physical parameters matter; the request queue being edited above does not.
  const { diskSize, direction, rpm, seekRate, seekModel, seekA, countReturnJump, agingAlpha } = input;

  const result = useMemo(() => {
    const base: VisualizerInput = {
      requests: [], headStart: 0, diskSize, direction, rpm, seekRate, seekModel, seekA, countReturnJump, agingAlpha,
    };
    return runBenchmark({ base, kind, runs: RUNS, requestsPerRun, seed });
  }, [diskSize, direction, rpm, seekRate, seekModel, seekA, countReturnJump, agingAlpha, kind, requestsPerRun, seed]);

  const byTime = result.rows[0];
  const byDistance = [...result.rows].sort((a, b) => a.rankByDistance - b.rankByDistance)[0];
  const biggestJump = [...result.rows].sort(
    (a, b) => (b.rankByDistance - b.rankByTime) - (a.rankByDistance - a.rankByTime)
  )[0];

  const inputCls = 'px-3 py-2 rounded-lg text-xs font-mono focus:outline-none';
  const inputStyle = { background: 'rgba(8,13,26,0.6)', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-primary)' };

  return (
    <div className="card p-5 lg:p-6">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-bright)]" style={{ boxShadow: '0 0 6px var(--accent-glow)' }} />
        <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-[0.15em]">Benchmark: {RUNS} Seeded Workloads</h3>
      </div>
      <p className="text-[11px] text-[var(--text-muted)] mb-4 leading-relaxed">
        One workload is an anecdote. This runs every algorithm on the same {RUNS} generated workloads, using the
        disk settings on the left, and reports the mean with a 95% confidence interval.
      </p>

      <div className="flex flex-wrap gap-2 mb-2">
        {KINDS.map(k => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className="px-3 py-2 rounded-lg text-[11px] font-semibold transition-all"
            style={{
              background: kind === k ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${kind === k ? 'rgba(6,182,212,0.4)' : 'rgba(255,255,255,0.06)'}`,
              color: kind === k ? 'var(--accent-bright)' : 'var(--text-muted)',
            }}
          >
            {WORKLOAD_INFO[k].label}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-[var(--text-muted)] mb-4">{WORKLOAD_INFO[kind].description}</p>

      <div className="flex flex-wrap items-end gap-4 mb-4">
        <label className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider flex flex-col gap-1">
          Requests per workload
          <NumberField ariaLabel="Requests per workload" min={2} max={60} value={requestsPerRun} onChange={setRequestsPerRun}
            className={`${inputCls} w-24`} style={inputStyle} />
        </label>
        <label className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider flex flex-col gap-1">
          Seed
          <NumberField ariaLabel="Seed" min={0} max={1000000} value={seed} onChange={setSeed}
            className={`${inputCls} w-24`} style={inputStyle} />
        </label>
        <label className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider flex flex-col gap-1">
          Load run # into visualizer
          <span className="flex gap-2">
            <NumberField ariaLabel="Run number" min={1} max={RUNS} value={sampleRun} onChange={setSampleRun}
              className={`${inputCls} w-20`} style={inputStyle} />
            <button
              onClick={() => onLoadWorkload(benchmarkWorkload({ kind, requestsPerRun, seed, diskSize }, sampleRun - 1))}
              className="px-3 py-2 rounded-lg text-[11px] font-semibold"
              style={{ background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.4)', color: 'var(--accent-bright)' }}
            >
              Load
            </button>
          </span>
        </label>
      </div>

      <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5 mb-4 text-[11px] text-[var(--text-secondary)] leading-relaxed">
        {byTime.algorithm === byDistance.algorithm ? (
          <><b style={{ color: ALGO_COLORS[byTime.algorithm] }}>{byTime.algorithm}</b> is best by both mean seek distance and mean access time.</>
        ) : (
          <>
            By seek distance, <b style={{ color: ALGO_COLORS[byDistance.algorithm] }}>{byDistance.algorithm}</b> wins.
            By access time, <b style={{ color: ALGO_COLORS[byTime.algorithm] }}>{byTime.algorithm}</b> wins
            {' '}({(100 * (1 - byTime.accessTime.mean / byDistance.accessTime.mean)).toFixed(1)}% faster than {byDistance.algorithm}).
          </>
        )}
        {biggestJump.rankByDistance - biggestJump.rankByTime >= 2 && (
          <> Biggest rank change: <b style={{ color: ALGO_COLORS[biggestJump.algorithm] }}>{biggestJump.algorithm}</b> moves
            from #{biggestJump.rankByDistance} by distance to #{biggestJump.rankByTime} by time.</>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/5">
        <table className="w-full text-sm">
          <thead style={{ background: 'var(--bg-elevated)' }}>
            <tr className="text-left">
              {['#', 'Algorithm', 'Mean access ms (±95% CI)', 'Mean seek dist (±95% CI)', 'Rank by dist', `Best in / ${RUNS}`].map((h, i) => (
                <th key={h} className={`px-3 py-3 text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] ${i > 1 ? 'text-right' : ''}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map(r => (
              <tr key={r.algorithm} className="border-t border-white/5 font-mono text-[11px] text-[var(--text-secondary)]">
                <td className="px-3 py-2.5 text-[var(--text-muted)]">{r.rankByTime}</td>
                <td className="px-3 py-2.5 font-bold" style={{ color: ALGO_COLORS[r.algorithm] }}>{r.algorithm}</td>
                <td className="px-3 py-2.5 text-right">
                  {r.accessTime.mean.toFixed(1)} <span className="text-[var(--text-muted)]">± {r.accessTime.ci95.toFixed(1)}</span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  {r.seekDistance.mean.toFixed(0)} <span className="text-[var(--text-muted)]">± {r.seekDistance.ci95.toFixed(0)}</span>
                </td>
                <td className="px-3 py-2.5 text-right text-[var(--text-muted)]">#{r.rankByDistance}</td>
                <td className="px-3 py-2.5 text-right">{r.wins}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--text-muted)] mt-3 leading-relaxed">
        "Best in" counts runs where the algorithm had the lowest access time; ties count for each, so the column can
        sum to more than {RUNS}. SSTF-AGE matches SSTF here because in a static batch every request has waited equally long.
      </p>
    </div>
  );
}
