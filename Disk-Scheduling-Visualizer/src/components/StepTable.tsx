import { useMemo, useRef, useEffect } from 'react';
import type { AlgorithmResult } from '@/types';

interface Props {
  result: AlgorithmResult;
  currentStep: number;
}

export function StepTable({ result, currentStep }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLTableRowElement>(null);

  const totalAccessTime = useMemo(() => {
    return result.steps.reduce((s, st) => s + st.rotationalLatency, 0) + result.seekTime;
  }, [result.steps, result.seekTime]);

  // Keep the active row visible by scrolling only the table's own box.
  // (scrollIntoView would also scroll the whole page, yanking the view away from
  // the cylinder track and platter during playback.)
  useEffect(() => {
    const row = activeRef.current;
    const box = scrollRef.current;
    if (!row || !box) return;
    const header = box.querySelector('thead')?.getBoundingClientRect().height ?? 0;
    const r = row.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    if (r.top < b.top + header) box.scrollTo({ top: box.scrollTop - (b.top + header - r.top), behavior: 'smooth' });
    else if (r.bottom > b.bottom) box.scrollTo({ top: box.scrollTop + (r.bottom - b.bottom), behavior: 'smooth' });
  }, [currentStep]);

  return (
    <div className="card p-5 lg:p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-bright)]" style={{ boxShadow: '0 0 6px var(--accent-glow)' }} />
          <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-[0.15em]">Step Table</h3>
        </div>
        <span className="text-xs font-mono text-[var(--text-muted)]">
          <span className="text-[var(--accent-bright)]">{Math.min(currentStep, result.steps.length)}</span> / {result.steps.length}
        </span>
      </div>

      <div ref={scrollRef} className="overflow-y-auto max-h-[300px] rounded-xl border border-white/5">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10" style={{ background: 'var(--bg-elevated)' }}>
            <tr className="text-left">
              {['#', 'From', 'To', 'Dist', 'Cumul', 'Seek Time', 'Sector', 'Rot.Lat'].map((h, i) => (
                <th
                  key={h}
                  className={`px-3 py-3 text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] ${i >= 3 ? 'text-right' : ''}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.steps.map((step, i) => {
              const isActive = i === currentStep;
              const isDone = i < currentStep;
              return (
                <tr
                  key={i}
                  ref={isActive ? activeRef : null}
                  className="border-t border-white/5 transition-all"
                  style={{
                    background: isActive ? 'rgba(6,182,212,0.08)' : 'transparent',
                    borderLeft: isActive ? '2px solid var(--accent-bright)' : '2px solid transparent',
                    opacity: isDone ? 0.5 : isActive ? 1 : 0.35,
                  }}
                >
                  <td className="px-3 py-2.5 font-mono text-[11px] text-[var(--text-muted)]">{i + 1}</td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-[var(--text-secondary)]">{step.from}</td>
                  <td className="px-3 py-2.5 font-mono text-[11px] font-bold" style={{ color: isActive ? 'var(--accent-bright)' : 'var(--text-primary)' }}>
                    {step.to}
                    {step.isBoundary && (
                      <span className="ml-1.5 text-[9px] font-normal px-1 py-0.2 rounded bg-amber-500/15 text-amber-300">
                        bound
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-right text-[var(--text-primary)]">{step.distance}</td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-right text-[var(--text-secondary)]">{step.cumulativeDistance}</td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-right text-[var(--text-secondary)]">{step.seekTime.toFixed(2)}ms</td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-right text-[var(--text-muted)]">
                    {step.sectorAngle !== null ? `${step.sectorAngle.toFixed(1)}°` : <span className="opacity-30">—</span>}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-right text-[var(--text-muted)]">
                    {step.isBoundary ? (
                      <span className="text-[10px] text-amber-400/80 px-1.5 py-0.5 rounded bg-white/5">0.00ms (bound)</span>
                    ) : (
                      `${step.rotationalLatency.toFixed(2)}ms`
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 pt-3 border-t border-white/5 flex justify-between items-center">
        <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Total Access Time (Seek + Rot. Latency)</span>
        <span className="font-mono font-bold text-[var(--accent-bright)] text-sm">{totalAccessTime.toFixed(2)} ms</span>
      </div>
    </div>
  );
}
