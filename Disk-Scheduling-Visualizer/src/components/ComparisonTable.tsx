import { useMemo } from 'react';
import type { Algorithm, VisualizerInput } from '@/types';
import { ALGORITHMS, runAlgorithm } from '@/lib/algorithms';
import { rankBy } from '@/lib/benchmark';
import { ALGO_COLORS } from '@/lib/palette';

interface Props {
  input: VisualizerInput;
  algorithm: Algorithm;
  onSelect: (algo: Algorithm) => void;
}

export function ComparisonTable({ input, algorithm, onSelect }: Props) {
  const rows = useMemo(() => {
    const rows = ALGORITHMS.map(a => {
      const r = runAlgorithm(a, input);
      return {
        algorithm: a,
        distance: r.totalSeekDistance,
        seekTime: r.seekTime,
        rotation: r.totalAccessTime - r.seekTime,
        access: r.totalAccessTime,
        rankByDistance: 0,
        rankByTime: 0,
      };
    });
    rankBy(rows, r => r.distance, (r, k) => (r.rankByDistance = k));
    rankBy(rows, r => r.access, (r, k) => (r.rankByTime = k));
    return rows.sort((x, y) => x.rankByTime - y.rankByTime);
  }, [input]);

  if (input.requests.length === 0) return null;

  const minOf = (f: (r: (typeof rows)[number]) => number) => Math.min(...rows.map(f));
  const best = {
    distance: minOf(r => r.distance),
    seekTime: minOf(r => r.seekTime),
    rotation: minOf(r => r.rotation),
    access: minOf(r => r.access),
  };
  const bestByDistance = rows.filter(r => r.rankByDistance === 1).map(r => r.algorithm);
  const bestByTime = rows.filter(r => r.rankByTime === 1).map(r => r.algorithm);
  const flipped = !bestByTime.some(a => bestByDistance.includes(a));
  const sameWinners = bestByTime.length === bestByDistance.length && bestByTime.every(a => bestByDistance.includes(a));

  const cell = (value: number, isBest: boolean, digits: number) => (
    <span style={{ color: isBest ? 'var(--accent-bright)' : undefined, fontWeight: isBest ? 700 : undefined }}>
      {value.toFixed(digits)}
    </span>
  );

  return (
    <div className="card p-5 lg:p-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-bright)]" style={{ boxShadow: '0 0 6px var(--accent-glow)' }} />
          <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-[0.15em]">Same Workload, Every Algorithm</h3>
        </div>
        <span className="text-[10px] font-mono text-[var(--text-muted)]">click a row to visualize it</span>
      </div>
      <p className="text-[11px] text-[var(--text-muted)] mb-4 leading-relaxed">
        {sameWinners
          ? <><b className="text-[var(--text-primary)]">{bestByTime.join(' / ')}</b> {bestByTime.length > 1 ? 'are' : 'is'} best by both seek distance and access time on this workload.</>
          : <>Best by seek distance (the textbook metric): <b className="text-[var(--text-primary)]">{bestByDistance.join(' / ')}</b>. Best by actual access time: <b className="text-[var(--text-primary)]">{bestByTime.join(' / ')}</b>.{flipped && ' The ranking flips.'}</>}
      </p>

      <div className="overflow-x-auto rounded-xl border border-white/5">
        <table className="w-full text-sm">
          <thead style={{ background: 'var(--bg-elevated)' }}>
            <tr className="text-left">
              {['Algorithm', 'Seek dist', 'Rank', 'Seek ms', 'Rot. wait ms', 'Access ms', 'Rank'].map((h, i) => (
                <th key={i} className={`px-3 py-3 text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] ${i > 0 ? 'text-right' : ''}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const active = r.algorithm === algorithm;
              return (
                <tr
                  key={r.algorithm}
                  onClick={() => onSelect(r.algorithm)}
                  className="border-t border-white/5 cursor-pointer hover:bg-white/[0.03] font-mono text-[11px] text-[var(--text-secondary)]"
                  style={{ background: active ? 'rgba(6,182,212,0.08)' : undefined }}
                >
                  <td className="px-3 py-2.5 font-bold" style={{ color: ALGO_COLORS[r.algorithm] }}>{r.algorithm}</td>
                  <td className="px-3 py-2.5 text-right">{cell(r.distance, r.distance === best.distance, 0)}</td>
                  <td className="px-3 py-2.5 text-right text-[var(--text-muted)]">#{r.rankByDistance}</td>
                  <td className="px-3 py-2.5 text-right">{cell(r.seekTime, r.seekTime === best.seekTime, 2)}</td>
                  <td className="px-3 py-2.5 text-right">{cell(r.rotation, r.rotation === best.rotation, 2)}</td>
                  <td className="px-3 py-2.5 text-right">{cell(r.access, r.access === best.access, 2)}</td>
                  <td className="px-3 py-2.5 text-right text-[var(--text-muted)]">#{r.rankByTime}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
