import { useState } from 'react';
import type { OnlineResult } from '@/lib/online';

// Status "serious": reserved for state (starved), always paired with shape + label.
const STARVED = '#ec835a';
const GRID = 'rgba(255,255,255,0.06)';
const AXIS_TEXT = '#94a3b8';
const SURFACE = '#0b1220';

const W = 760;
const PAD = { l: 48, r: 16, t: 14, b: 28 };

interface Props {
  result: OnlineResult;
  color: string;
}

function ticks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map(m => m * mag).find(s => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) out.push(v);
  return out;
}

export function OnlineCharts({ result, color }: Props) {
  const [hoverDot, setHoverDot] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);

  const tMax = Math.max(1, result.makespan, ...result.queue.map(q => q.time));
  const x = (t: number) => PAD.l + (t / tMax) * (W - PAD.l - PAD.r);
  const xTicks = ticks(tMax / 1000).map(s => s * 1000);

  // Chart 1: response time per request
  const H1 = 220;
  const rMax = Math.max(1, ...result.served.map(s => s.response)) * 1.05;
  const y1 = (v: number) => H1 - PAD.b - (v / rMax) * (H1 - PAD.t - PAD.b);
  const threshold = result.starvationThreshold;

  // Chart 2: queue depth over time (step line)
  const H2 = 140;
  const dMax = Math.max(1, ...result.queue.map(q => q.depth));
  const y2 = (v: number) => H2 - PAD.b - (v / dMax) * (H2 - PAD.t - PAD.b);
  let path = '';
  result.queue.forEach((q, i) => {
    path += i === 0 ? `M${x(q.time)},${y2(q.depth)}` : `H${x(q.time)}V${y2(q.depth)}`;
  });

  const depthAt = (t: number) => {
    let d = 0;
    for (const q of result.queue) {
      if (q.time > t) break;
      d = q.depth;
    }
    return d;
  };

  const toSvgX = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return ((e.clientX - rect.left) / rect.width) * W;
  };

  const onDotsMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const py = ((e.clientY - rect.top) / rect.height) * H1;
    let best = -1;
    let bestD = 18 * 18; // hit radius larger than the mark
    result.served.forEach((s, i) => {
      const d = (x(s.arrival) - px) ** 2 + (y1(s.response) - py) ** 2;
      if (d < bestD) {
        best = i;
        bestD = d;
      }
    });
    setHoverDot(best >= 0 ? best : null);
  };

  const dot = hoverDot !== null ? result.served[hoverDot] : null;
  const axisLabel = 'text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]';

  return (
    <div className="space-y-4">
      <div>
        <div className="flex justify-between items-baseline mb-1">
          <span className={axisLabel}>Response time of each request (ms) by arrival time</span>
          <span className="text-[10px] font-mono text-[var(--text-secondary)] flex items-center gap-1.5">
            <svg width="10" height="10"><path d="M5 1 L9 9 L1 9 Z" fill={STARVED} /></svg>
            starved: {result.starved} of {result.served.length}
          </span>
        </div>
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H1}`} className="w-full h-auto" onPointerMove={onDotsMove} onPointerLeave={() => setHoverDot(null)}
            role="img" aria-label={`Response time per request; ${result.starved} requests above the starvation threshold`}>
            {ticks(rMax).map(v => (
              <g key={v}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y1(v)} y2={y1(v)} stroke={GRID} />
                <text x={PAD.l - 6} y={y1(v) + 3} textAnchor="end" fontSize="10" fill={AXIS_TEXT}>{v}</text>
              </g>
            ))}
            {xTicks.map(v => (
              <text key={v} x={x(v)} y={H1 - 8} textAnchor="middle" fontSize="10" fill={AXIS_TEXT}>{(v / 1000).toFixed(v % 1000 ? 1 : 0)}s</text>
            ))}
            {threshold < rMax && (
              <g>
                <line x1={PAD.l} x2={W - PAD.r} y1={y1(threshold)} y2={y1(threshold)} stroke={STARVED} strokeDasharray="4 4" strokeWidth={1.5} />
                <text x={W - PAD.r} y={y1(threshold) - 5} textAnchor="end" fontSize="10" fill="#f0f4fa">
                  starved above 3× mean ({threshold.toFixed(0)} ms)
                </text>
              </g>
            )}
            {result.served.map((s, i) => {
              const cx = x(s.arrival);
              const cy = y1(s.response);
              const starved = s.response > threshold;
              const active = i === hoverDot;
              return starved ? (
                <path key={s.id} d={`M${cx} ${cy - 6} L${cx + 5.5} ${cy + 4} L${cx - 5.5} ${cy + 4} Z`}
                  fill={STARVED} stroke={SURFACE} strokeWidth={active ? 3 : 2} />
              ) : (
                <circle key={s.id} cx={cx} cy={cy} r={active ? 5.5 : 4} fill={color} stroke={SURFACE} strokeWidth={2} />
              );
            })}
          </svg>
          {dot && (
            <div className="absolute pointer-events-none px-2.5 py-1.5 rounded-lg text-[10px] font-mono"
              style={{
                left: `${(x(dot.arrival) / W) * 100}%`,
                top: `${(y1(dot.response) / H1) * 100}%`,
                transform: `translate(${x(dot.arrival) > W * 0.7 ? 'calc(-100% - 10px)' : '10px'}, -50%)`,
                background: 'var(--bg-elevated)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)',
              }}>
              <div><b className="text-[var(--text-primary)]">{dot.response.toFixed(1)} ms</b> response{dot.response > threshold ? ' · starved' : ''}</div>
              <div>request #{dot.id} · cylinder {dot.cylinder}</div>
              <div>arrived {(dot.arrival / 1000).toFixed(3)} s</div>
            </div>
          )}
        </div>
      </div>

      <div>
        <span className={axisLabel}>Queue depth (requests waiting)</span>
        <div className="relative mt-1">
          <svg viewBox={`0 0 ${W} ${H2}`} className="w-full h-auto"
            onPointerMove={e => setHoverX(Math.min(W - PAD.r, Math.max(PAD.l, toSvgX(e))))} onPointerLeave={() => setHoverX(null)}
            role="img" aria-label={`Queue depth over time, peak ${dMax}`}>
            {ticks(dMax, 3).map(v => (
              <g key={v}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y2(v)} y2={y2(v)} stroke={GRID} />
                <text x={PAD.l - 6} y={y2(v) + 3} textAnchor="end" fontSize="10" fill={AXIS_TEXT}>{v}</text>
              </g>
            ))}
            {xTicks.map(v => (
              <text key={v} x={x(v)} y={H2 - 8} textAnchor="middle" fontSize="10" fill={AXIS_TEXT}>{(v / 1000).toFixed(v % 1000 ? 1 : 0)}s</text>
            ))}
            <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
            {hoverX !== null && <line x1={hoverX} x2={hoverX} y1={PAD.t} y2={H2 - PAD.b} stroke="rgba(255,255,255,0.3)" />}
          </svg>
          {hoverX !== null && (() => {
            const t = ((hoverX - PAD.l) / (W - PAD.l - PAD.r)) * tMax;
            return (
              <div className="absolute pointer-events-none px-2.5 py-1.5 rounded-lg text-[10px] font-mono"
                style={{
                  left: `${(hoverX / W) * 100}%`, top: 0,
                  transform: `translateX(${hoverX > W * 0.7 ? 'calc(-100% - 10px)' : '10px'})`,
                  background: 'var(--bg-elevated)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)',
                }}>
                <b className="text-[var(--text-primary)]">{depthAt(t)}</b> waiting at {(t / 1000).toFixed(2)} s
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
