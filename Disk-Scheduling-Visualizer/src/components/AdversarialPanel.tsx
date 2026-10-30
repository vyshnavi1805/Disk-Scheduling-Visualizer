import { useState } from 'react';
import { NumberField } from './NumberField';
import type { Algorithm, VisualizerInput } from '@/types';
import { ALGORITHMS } from '@/lib/algorithms';
import { findAdversarialWorkload, type AdversarialResult, type CostMetric } from '@/lib/adversarial';
import type { Workload } from '@/lib/workloads';
import { ALGO_COLORS } from '@/lib/palette';

interface Props {
  input: VisualizerInput;
  onLoad: (w: Workload, algorithm: Algorithm) => void;
}

const PRESETS: { label: string; victim: Algorithm; reference: Algorithm; metric: CostMetric }[] = [
  { label: 'Break SSTF (vs SATF, time)', victim: 'SSTF', reference: 'SATF', metric: 'access' },
  { label: 'Can SATF lose to SSTF?', victim: 'SATF', reference: 'SSTF', metric: 'access' },
  { label: 'Can SATF lose to FCFS?', victim: 'SATF', reference: 'FCFS', metric: 'access' },
  { label: 'FCFS worst case', victim: 'FCFS', reference: 'SSTF', metric: 'distance' },
  { label: 'SSTF vs LOOK', victim: 'SSTF', reference: 'LOOK', metric: 'distance' },
];

export function AdversarialPanel({ input, onLoad }: Props) {
  const [victim, setVictim] = useState<Algorithm>('SSTF');
  const [reference, setReference] = useState<Algorithm>('SATF');
  const [metric, setMetric] = useState<CostMetric>('access');
  const [requests, setRequests] = useState(10);
  const [seed, setSeed] = useState(1);
  const [result, setResult] = useState<AdversarialResult | null>(null);
  const [searchedFor, setSearchedFor] = useState<{ victim: Algorithm; reference: Algorithm; metric: CostMetric } | null>(null);
  const [busy, setBusy] = useState(false);

  const search = (v = victim, r = reference, m = metric) => {
    setVictim(v);
    setReference(r);
    setMetric(m);
    setBusy(true);
    // Let the "Searching…" state paint before the synchronous search runs
    setTimeout(() => {
      setResult(findAdversarialWorkload({ base: input, victim: v, reference: r, metric: m, requests, seed }));
      setSearchedFor({ victim: v, reference: r, metric: m });
      setBusy(false);
    }, 20);
  };

  const unit = searchedFor?.metric === 'access' ? 'ms' : 'cyl';
  const inputCls = 'px-3 py-2 rounded-lg text-xs font-mono focus:outline-none';
  const inputStyle = { background: 'rgba(8,13,26,0.6)', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-primary)' };
  const label = 'text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider flex flex-col gap-1';

  return (
    <div className="card p-5 lg:p-6">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-bright)]" style={{ boxShadow: '0 0 6px var(--accent-glow)' }} />
        <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-[0.15em]">Adversarial Workload Finder</h3>
      </div>
      <p className="text-[11px] text-[var(--text-muted)] mb-4 leading-relaxed">
        Searches for the request queue where algorithm A does worst compared with algorithm B, i.e. the one that
        maximizes cost(A) / cost(B). It uses hill climbing from random starts, so it finds a bad case, not
        necessarily the worst possible one.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        {PRESETS.map(p => (
          <button
            key={p.label}
            disabled={busy}
            onClick={() => search(p.victim, p.reference, p.metric)}
            className="px-3 py-2 rounded-lg text-[11px] font-semibold transition-all"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-4 mb-4">
        <label className={label}>
          A (make it look bad)
          <select value={victim} onChange={e => setVictim(e.target.value as Algorithm)} className={inputCls} style={inputStyle}>
            {ALGORITHMS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className={label}>
          B (compared with)
          <select value={reference} onChange={e => setReference(e.target.value as Algorithm)} className={inputCls} style={inputStyle}>
            {ALGORITHMS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className={label}>
          Cost
          <select value={metric} onChange={e => setMetric(e.target.value as CostMetric)} className={inputCls} style={inputStyle}>
            <option value="access">Access time</option>
            <option value="distance">Seek distance</option>
          </select>
        </label>
        <label className={label}>
          Requests
          <NumberField ariaLabel="Requests" min={2} max={30} value={requests} onChange={setRequests}
            className={`${inputCls} w-20`} style={inputStyle} />
        </label>
        <label className={label}>
          Seed
          <NumberField ariaLabel="Seed" min={0} max={1000000} value={seed} onChange={setSeed}
            className={`${inputCls} w-20`} style={inputStyle} />
        </label>
        <button
          disabled={busy}
          onClick={() => search()}
          className="px-4 py-2 rounded-lg text-[11px] font-semibold"
          style={{ background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.4)', color: 'var(--accent-bright)' }}
        >
          {busy ? 'Searching…' : 'Search'}
        </button>
      </div>

      {result && searchedFor && (
        <div className="p-4 rounded-lg bg-white/[0.02] border border-white/5 space-y-3">
          {result.ratio <= 1 + 1e-9 ? (
            <p className="text-[12px] text-[var(--text-secondary)]">
              No workload found where <b style={{ color: ALGO_COLORS[searchedFor.victim] }}>{searchedFor.victim}</b> costs
              more than <b style={{ color: ALGO_COLORS[searchedFor.reference] }}>{searchedFor.reference}</b>
              {' '}({searchedFor.metric === 'access' ? 'access time' : 'seek distance'}). Best ratio: {result.ratio.toFixed(3)}×.
            </p>
          ) : (
            <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
              On this workload <b style={{ color: ALGO_COLORS[searchedFor.victim] }}>{searchedFor.victim}</b> costs{' '}
              <b className="text-[var(--accent-bright)] text-base font-mono">{result.ratio.toFixed(2)}×</b> as much as{' '}
              <b style={{ color: ALGO_COLORS[searchedFor.reference] }}>{searchedFor.reference}</b>
              {' '}({result.costVictim.toFixed(2)} vs {result.costReference.toFixed(2)} {unit}).
              Random workloads only reached {result.startRatio.toFixed(2)}×.
            </p>
          )}
          <p className="text-[11px] font-mono text-[var(--text-muted)] break-words">
            head {result.workload.headStart} · cylinders [{result.workload.requests.map(r => r.cylinder).join(', ')}]
          </p>
          {result.costReference < 0.05 * result.costVictim && (
            <p className="text-[10px] text-amber-300/80">
              The ratio is large mainly because {searchedFor.reference}'s cost is close to zero. Look at the absolute numbers too.
            </p>
          )}
          <button
            onClick={() => onLoad(result.workload, searchedFor.victim)}
            className="px-3 py-2 rounded-lg text-[11px] font-semibold"
            style={{ background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.4)', color: 'var(--accent-bright)' }}
          >
            Load into visualizer
          </button>
        </div>
      )}
    </div>
  );
}
