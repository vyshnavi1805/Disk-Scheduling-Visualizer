import { useMemo } from 'react';
import type { AlgorithmResult, VisualizerInput } from '@/types';
import { frameAt } from '@/lib/playback';

interface Props {
  result: AlgorithmResult;
  input: VisualizerInput;
  currentStep: number;
  progress: number;
}

export function CylinderTrack({ result, input, currentStep, progress }: Props) {
  const maxCylinder = Math.max(1, input.diskSize - 1);

  // Same timing as the platter: the head travels during the seek, then holds while the sector comes round.
  const headPosition = frameAt(result.steps, input.headStart, input.rpm, currentStep, progress).cylinder;

  const headPercent = Math.min(100, Math.max(0, (headPosition / maxCylinder) * 100));

  const servicedRequests = useMemo(() => {
    const set = new Set<number>();
    for (let i = 0; i < currentStep && i < result.steps.length; i++) {
      if (!result.steps[i].isBoundary) set.add(result.steps[i].to);
    }
    return set;
  }, [currentStep, result.steps]);

  const uniqueRequests = useMemo(() => {
    return [...new Set([...input.requests.map(r => r.cylinder), input.headStart])].sort((a, b) => a - b);
  }, [input.requests, input.headStart]);

  return (
    <div className="card p-5 lg:p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-bright)]" style={{ boxShadow: '0 0 6px var(--accent-glow)' }} />
          <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-[0.15em]">Cylinder Track</h3>
        </div>
        <span className="text-xs font-mono text-[var(--text-muted)]">
          Head: <span className="text-[var(--accent-bright)] font-bold">{Math.round(headPosition)}</span> / {maxCylinder}
        </span>
      </div>

      {/* Track */}
      <div className="relative h-20 mb-3">
        {/* Track line with gradient */}
        <div className="absolute top-1/2 left-0 right-0 h-[3px] -translate-y-1/2 rounded-full" style={{
          background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.04) 100%)',
        }} />

        {/* Glow line under track */}
        <div className="absolute top-1/2 left-0 right-0 h-[20px] -translate-y-1/2 rounded-full opacity-30" style={{
          background: 'linear-gradient(90deg, transparent, rgba(6,182,212,0.15), transparent)',
          filter: 'blur(8px)',
        }} />

        {/* End markers */}
        <div className="absolute top-1/2 left-0 -translate-y-1/2 w-[2px] h-12 rounded-full bg-white/20" />
        <div className="absolute top-1/2 right-0 -translate-y-1/2 w-[2px] h-12 rounded-full bg-white/20" />

        {/* Cylinder ticks (0 to maxCylinder) */}
        {Array.from({ length: 11 }, (_, i) => {
          const pos = (i / 10) * maxCylinder;
          const percent = (i / 10) * 100;
          return (
            <div key={i} className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center" style={{ left: `${percent}%` }}>
              <div className="w-[1px] h-2.5 bg-white/10" />
              <span className="text-[8px] font-mono text-[var(--text-muted)] mt-1.5">{Math.round(pos)}</span>
            </div>
          );
        })}

        {/* Traveled path overlay */}
        {currentStep > 0 && (
          <div
            className="absolute top-1/2 -translate-y-1/2 h-[3px] rounded-full transition-all"
            style={{
              left: 0,
              width: `${headPercent}%`,
              background: 'linear-gradient(90deg, rgba(16,185,129,0.3), rgba(6,182,212,0.5))',
              boxShadow: '0 0 8px rgba(6,182,212,0.3)',
            }}
          />
        )}

        {/* Requests */}
        {uniqueRequests.map((req, i) => {
          const percent = (req / maxCylinder) * 100;
          const isHeadStart = req === input.headStart;
          const isServiced = servicedRequests.has(req);
          const isCurrentTarget = currentStep < result.steps.length && result.steps[currentStep]?.to === req;

          let bg = 'var(--bg-elevated)';
          let border = 'var(--accent-bright)';
          let shadow = 'none';
          let size = 'w-3 h-3';

          if (isHeadStart) {
            bg = '#f59e0b'; border = '#f59e0b'; shadow = '0 0 10px rgba(245,158,11,0.6)';
          } else if (isServiced) {
            bg = '#10b981'; border = '#10b981'; shadow = '0 0 10px rgba(16,185,129,0.5)';
          } else if (isCurrentTarget) {
            bg = '#f43f5e'; border = '#f43f5e'; shadow = '0 0 16px rgba(244,63,94,0.7)';
            size = 'w-4 h-4';
          }

          return (
            <div key={`${req}-${i}`} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-all duration-300" style={{ left: `${percent}%` }}>
              {isCurrentTarget && (
                <div className="absolute inset-0 rounded-full" style={{ background: 'rgba(244,63,94,0.3)', animation: 'pulse-ring 1s ease-out infinite' }} />
              )}
              <div className={`${size} rounded-full border-2 transition-all duration-300`} style={{ background: bg, borderColor: border, boxShadow: shadow }} />
              {isHeadStart && (
                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] font-mono text-[var(--amber)] whitespace-nowrap">START</span>
              )}
            </div>
          );
        })}

        {/* Head */}
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10" style={{ left: `${headPercent}%` }}>
          <div className="relative flex flex-col items-center">
            {/* Glow */}
            <div className="absolute -top-1 w-8 h-8 rounded-full opacity-40" style={{ background: 'radial-gradient(circle, var(--accent-bright), transparent 70%)', filter: 'blur(4px)' }} />
            {/* Line */}
            <div className="w-[2px] h-16 rounded-full" style={{ background: 'linear-gradient(to bottom, var(--accent-bright), rgba(34,211,238,0.1))' }} />
            {/* Head dot */}
            <div className="absolute top-0 w-5 h-5 rounded-full border-2 border-white/40" style={{
              background: 'var(--accent-bright)',
              boxShadow: '0 0 20px 4px rgba(34,211,238,0.6), inset 0 0 4px rgba(255,255,255,0.3)',
            }} />
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 border-t border-white/5">
        {[
          ['#f59e0b', 'Head Start'],
          ['#10b981', 'Serviced'],
          ['#f43f5e', 'Target'],
          ['#22d3ee', 'Head'],
        ].map(([color, label]) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
            <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
