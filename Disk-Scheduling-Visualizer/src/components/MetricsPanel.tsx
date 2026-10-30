import type { AlgorithmResult } from '@/types';
import { TrendingUp, Clock, Activity, Disc3 } from 'lucide-react';

interface Props {
  result: AlgorithmResult;
}

export function MetricsPanel({ result }: Props) {
  const totalRotLatency = result.steps.reduce((s, st) => s + st.rotationalLatency, 0);

  const metrics = [
    {
      label: 'Total Seek',
      value: result.totalSeekDistance,
      unit: 'cylinders',
      icon: TrendingUp,
      color: '#22d3ee',
      glow: 'rgba(34,211,238,0.15)',
    },
    {
      label: 'Seek Time',
      value: result.seekTime.toFixed(2),
      unit: 'ms',
      icon: Clock,
      color: '#3b82f6',
      glow: 'rgba(59,130,246,0.15)',
    },
    {
      label: 'Avg Seek',
      value: result.avgSeekDistance.toFixed(1),
      unit: 'cylinders',
      icon: Activity,
      color: '#10b981',
      glow: 'rgba(16,185,129,0.15)',
    },
    {
      label: 'Avg Rot. Latency',
      value: result.avgRotationalLatency.toFixed(2),
      unit: 'ms',
      icon: Disc3,
      color: '#f59e0b',
      glow: 'rgba(245,158,11,0.15)',
    },
    {
      label: 'Total Access',
      value: (result.seekTime + totalRotLatency).toFixed(2),
      unit: 'ms',
      icon: TrendingUp,
      color: '#f43f5e',
      glow: 'rgba(244,63,94,0.15)',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {metrics.map((m, i) => (
        <div
          key={m.label}
          className="card p-4 fade-in"
          style={{ animationDelay: `${i * 50}ms` }}
        >
          <div
            className="absolute top-0 left-3 right-3 h-[2px] rounded-full opacity-60"
            style={{ background: `linear-gradient(90deg, transparent, ${m.color}, transparent)` }}
          />
          <div className="flex items-center gap-2 mb-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: m.glow }}
            >
              <m.icon size={14} style={{ color: m.color }} strokeWidth={2.5} />
            </div>
            <span className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider leading-tight">
              {m.label}
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold font-mono" style={{ color: m.color }}>
              {m.value}
            </span>
            <span className="text-[10px] text-[var(--text-muted)]">{m.unit}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
