import { useMemo } from 'react';
import type { AlgorithmResult, VisualizerInput } from '@/types';
import { frameAt } from '@/lib/playback';

interface Props {
  result: AlgorithmResult;
  input: VisualizerInput;
  currentStep: number;
  progress: number;
}

export function SeekGraph({ result, input, currentStep, progress }: Props) {
  const width = 620;
  const height = 300;
  const padding = { top: 20, right: 30, bottom: 40, left: 50 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const maxCylinder = Math.max(1, input.diskSize - 1);

  const points = useMemo(() => {
    const pts: { x: number; y: number; label: string; step: number; isBoundary?: boolean }[] = [{
      x: 0,
      y: plotH - (input.headStart / maxCylinder) * plotH,
      label: 'Start',
      step: -1,
    }];
    result.steps.forEach((step, i) => {
      pts.push({
        x: ((i + 1) / result.steps.length) * plotW,
        y: plotH - (step.to / maxCylinder) * plotH,
        label: step.isBoundary ? `${step.to} (B)` : String(step.to),
        step: i,
        isBoundary: step.isBoundary,
      });
    });
    return pts;
  }, [result.steps, input.headStart, maxCylinder, plotW, plotH]);

  const seekProgress = frameAt(result.steps, input.headStart, input.rpm, currentStep, progress).seekProgress;

  const visiblePoints = useMemo(() => {
    if (currentStep >= result.steps.length) return points;
    const shown = points.filter(p => p.step < currentStep);
    if (currentStep < result.steps.length) {
      const step = result.steps[currentStep];
      if (step) {
        const startX = (currentStep / result.steps.length) * plotW;
        const endX = ((currentStep + 1) / result.steps.length) * plotW;
        const interpX = startX + (endX - startX) * seekProgress;
        const startY = plotH - (step.from / maxCylinder) * plotH;
        const endY = plotH - (step.to / maxCylinder) * plotH;
        shown.push({ x: interpX, y: startY + (endY - startY) * seekProgress, label: '', step: currentStep });
      }
    }
    return shown;
  }, [currentStep, seekProgress, points, result.steps, plotW, plotH, maxCylinder]);

  const pathData = visiblePoints.length > 0 ? visiblePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') : '';

  const yTicks = Array.from({ length: 7 }, (_, i) => ({
    val: (i / 6) * maxCylinder,
    y: plotH - (i / 6) * plotH,
  }));

  return (
    <div className="card p-5 lg:p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-bright)]" style={{ boxShadow: '0 0 6px var(--accent-glow)' }} />
          <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-[0.15em]">Seek Graph</h3>
        </div>
        <span className="text-[10px] font-mono text-[var(--text-muted)]">
          Cylinders: 0 – {maxCylinder}
        </span>
      </div>

      <div className="overflow-x-auto">
        <svg width={width} height={height} className="min-w-full" style={{ filter: 'drop-shadow(0 4px 20px rgba(0,0,0,0.3))' }}>
          <defs>
            <linearGradient id="seek-line" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="50%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
            <linearGradient id="seek-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(6,182,212,0.12)" />
              <stop offset="100%" stopColor="rgba(6,182,212,0)" />
            </linearGradient>
            <filter id="line-glow">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Grid lines */}
          {yTicks.map(({ y, val }) => (
            <g key={val}>
              <line x1={padding.left} y1={padding.top + y} x2={width - padding.right} y2={padding.top + y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" strokeDasharray="2 4" />
              <text x={padding.left - 10} y={padding.top + y + 4} fill="var(--text-muted)" fontSize="10" textAnchor="end" fontFamily="JetBrains Mono">{Math.round(val)}</text>
            </g>
          ))}

          {/* Axis labels */}
          <text x={width / 2} y={height - 8} fill="var(--text-muted)" fontSize="10" textAnchor="middle" letterSpacing="2">STEP</text>
          <text x={16} y={height / 2} fill="var(--text-muted)" fontSize="10" textAnchor="middle" letterSpacing="2" transform={`rotate(-90 16 ${height / 2})`}>CYLINDER</text>

          {/* Plot area border */}
          <rect x={padding.left} y={padding.top} width={plotW} height={plotH} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" rx="4" />

          {/* Area fill */}
          {visiblePoints.length > 1 && (
            <path
              d={`${pathData} L ${visiblePoints[visiblePoints.length - 1].x} ${plotH} L ${visiblePoints[0].x} ${plotH} Z`}
              fill="url(#seek-area)"
              transform={`translate(${padding.left}, ${padding.top})`}
            />
          )}

          {/* Line path */}
          <g transform={`translate(${padding.left}, ${padding.top})`}>
            {visiblePoints.length > 1 && (
              <>
                <path d={pathData} fill="none" stroke="url(#seek-line)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.4" filter="url(#line-glow)" />
                <path d={pathData} fill="none" stroke="url(#seek-line)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              </>
            )}

            {/* Completed points */}
            {points.filter(p => p.step < currentStep || p.step === -1).map((p, i) => (
              <g key={`${p.label}-${i}`}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={p.isBoundary ? 3 : 4}
                  fill="var(--bg-card)"
                  stroke={p.step === -1 ? '#f59e0b' : p.isBoundary ? '#fbbf24' : '#22d3ee'}
                  strokeWidth={p.isBoundary ? 1.5 : 2}
                  strokeDasharray={p.isBoundary ? '2 2' : undefined}
                />
                {p.step === -1 && (
                  <text x={p.x + 8} y={p.y + 4} fill="#f59e0b" fontSize="9" fontFamily="JetBrains Mono" opacity={0.8}>START</text>
                )}
                {p.step >= 0 && (
                  <text
                    x={p.x}
                    y={p.y - 10}
                    fill={p.isBoundary ? '#fbbf24' : 'var(--text-muted)'}
                    fontSize="9"
                    textAnchor="middle"
                    fontFamily="JetBrains Mono"
                    opacity={p.isBoundary ? 0.7 : 0.6}
                  >
                    {p.label}
                  </text>
                )}
              </g>
            ))}

            {/* Current head position with pulse */}
            {currentStep < result.steps.length && visiblePoints.length > 0 && (
              <>
                <circle cx={visiblePoints[visiblePoints.length - 1].x} cy={visiblePoints[visiblePoints.length - 1].y} r="8" fill="rgba(6,182,212,0.2)">
                  <animate attributeName="r" from="4" to="12" dur="0.8s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.6" to="0" dur="0.8s" repeatCount="indefinite" />
                </circle>
                <circle cx={visiblePoints[visiblePoints.length - 1].x} cy={visiblePoints[visiblePoints.length - 1].y} r="5" fill="#22d3ee" stroke="white" strokeWidth="1" style={{ filter: 'drop-shadow(0 0 6px #22d3ee)' }} />
              </>
            )}
          </g>
        </svg>
      </div>
    </div>
  );
}
