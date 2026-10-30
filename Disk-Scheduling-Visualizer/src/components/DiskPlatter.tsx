import { useMemo } from 'react';
import type { AlgorithmResult, VisualizerInput } from '@/types';
import { frameAt } from '@/lib/playback';

interface Props {
  result: AlgorithmResult;
  input: VisualizerInput;
  currentStep: number;
  progress: number;
}

const size = 240;
const center = size / 2;
const maxRadius = 105;
const INNER = 30; // radius of cylinder 0
const OUTER = 100; // radius of the last cylinder
// The head sits at a fixed angle (12 o'clock). The timing model assumes this: a sector is
// under the head when the platter angle equals the sector angle.
const HEAD_ANGLE = -90;

const radiusOf = (cyl: number, maxCylinder: number) => INNER + (cyl / maxCylinder) * (OUTER - INNER);

const polar = (r: number, deg: number) => ({
  x: center + Math.cos((deg * Math.PI) / 180) * r,
  y: center + Math.sin((deg * Math.PI) / 180) * r,
});

export function DiskPlatter({ result, input, currentStep, progress }: Props) {
  const maxCylinder = Math.max(1, input.diskSize - 1);

  const frame = frameAt(result.steps, input.headStart, input.rpm, currentStep, progress);
  const headR = radiusOf(frame.cylinder, maxCylinder);
  const head = polar(headR, HEAD_ANGLE);
  const targetId = frame.phase === 'idle' || frame.phase === 'done' ? null : frame.step?.requestId ?? null;

  const requestPoints = useMemo(() => {
    const servedBefore = new Set(result.steps.slice(0, currentStep).map(s => s.requestId));
    return input.requests.map(request => {
      // Drawn at (sector + head angle) inside the group that rotates by -platterAngle,
      // so it reaches the head exactly when platterAngle == sector.
      const p = polar(radiusOf(request.cylinder, maxCylinder), request.sector + HEAD_ANGLE);
      return { id: request.id, ...p, isServiced: servedBefore.has(request.id) };
    });
  }, [input.requests, maxCylinder, currentStep, result.steps]);

  const target = targetId !== null ? input.requests.find(r => r.id === targetId) : undefined;
  const remainingDeg = target ? (((target.sector - frame.platterAngle) % 360) + 360) % 360 : 0;

  const status =
    frame.phase === 'idle' ? 'Ready'
      : frame.phase === 'done' ? 'All requests served'
      : frame.step?.isBoundary ? 'Moving to disk edge (no data)'
      : frame.phase === 'seeking' ? `Seeking to cylinder ${frame.step?.to}`
      : remainingDeg > 0.5 ? `Waiting for sector ${target?.sector.toFixed(0)}° (${remainingDeg.toFixed(0)}° to go)`
      : 'Reading';

  return (
    <div className="card p-5 lg:p-6 flex flex-col items-center">
      <div className="flex items-center justify-between mb-4 self-stretch">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-bright)]" style={{ boxShadow: '0 0 6px var(--accent-glow)' }} />
          <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-[0.15em]">Disk Platter</h3>
        </div>
        <span className="text-[10px] font-mono text-[var(--text-muted)]">
          {input.rpm.toLocaleString()} RPM
        </span>
      </div>

      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="relative overflow-visible" role="img"
          aria-label={`Disk platter: head at cylinder ${Math.round(frame.cylinder)}, platter at ${frame.platterAngle.toFixed(0)} degrees`}>
          <defs>
            <radialGradient id="platter-grad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#142036" />
              <stop offset="70%" stopColor="#0f1828" />
              <stop offset="100%" stopColor="#080d1a" />
            </radialGradient>
          </defs>

          {/* Platter surface */}
          <circle cx={center} cy={center} r={maxRadius} fill="url(#platter-grad)" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />

          {/* Track the head is on */}
          <circle cx={center} cy={center} r={headR} fill="none" stroke="rgba(34,211,238,0.25)" strokeWidth="1" strokeDasharray="2 3" />

          {/* Everything on the platter rotates with it, by the simulation's platter angle */}
          <g data-testid="platter-rotor" transform={`rotate(${-frame.platterAngle} ${center} ${center})`}>
            {[INNER, (INNER + OUTER) / 2, OUTER].map(r => (
              <circle key={r} cx={center} cy={center} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
            ))}
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i / 12) * 360;
              const p1 = polar(18, a);
              const p2 = polar(maxRadius, a);
              return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />;
            })}
            {/* Sector 0 index mark */}
            {(() => {
              const a = polar(maxRadius - 2, HEAD_ANGLE);
              const b = polar(maxRadius - 10, HEAD_ANGLE);
              return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(6,182,212,0.6)" strokeWidth="2" strokeLinecap="round" />;
            })()}

            {requestPoints.map(({ id, x, y, isServiced }) => {
              const isTarget = id === targetId;
              return (
                <circle
                  key={id}
                  data-request-id={id}
                  cx={x}
                  cy={y}
                  r={isTarget ? 5 : 3.5}
                  fill={isServiced ? '#10b981' : isTarget ? '#f43f5e' : 'rgba(6,182,212,0.4)'}
                  stroke={isTarget ? '#ffffff' : isServiced ? '#10b981' : '#22d3ee'}
                  strokeWidth={isTarget ? 1.5 : 1.2}
                />
              );
            })}

            <circle cx={center} cy={center} r={14} fill="#111b2e" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
          </g>

          {/* Actuator: fixed rail at 12 o'clock, head slides along it */}
          <line x1={center} y1={center - maxRadius - 14} x2={center} y2={center - INNER + 6} stroke="rgba(255,255,255,0.08)" strokeWidth="6" strokeLinecap="round" />
          <rect x={center - 12} y={center - maxRadius - 20} width="24" height="8" rx="2" fill="var(--bg-elevated)" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
          <line x1={center} y1={center - maxRadius - 12} x2={head.x} y2={head.y} stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" />
          <circle data-testid="platter-head" cx={head.x} cy={head.y} r="5" fill="#22d3ee" stroke="white" strokeWidth="1" style={{ filter: 'drop-shadow(0 0 6px #22d3ee)' }} />
        </svg>
      </div>

      <div className="mt-4 text-center space-y-1">
        <div className="text-[10px] font-mono text-[var(--text-muted)]">
          Cylinder <span className="text-[var(--accent-bright)] font-bold">{Math.round(frame.cylinder)}</span> / {maxCylinder}
          <span className="text-white/20"> • </span>
          Platter <span className="text-[var(--text-secondary)]">{frame.platterAngle.toFixed(0)}°</span>
          <span className="text-white/20"> • </span>
          t = <span className="text-[var(--text-secondary)]">{frame.timeMs.toFixed(2)} ms</span>
        </div>
        <div data-testid="platter-status" className="text-[10px] font-semibold text-[var(--text-secondary)]">{status}</div>
        <div className="text-[9px] text-[var(--text-muted)]">Distance from center = cylinder · angle = sector · head fixed at 12 o'clock</div>
      </div>
    </div>
  );
}
