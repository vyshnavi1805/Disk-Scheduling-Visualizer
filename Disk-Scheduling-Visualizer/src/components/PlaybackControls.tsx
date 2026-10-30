import type { PlaybackState } from '@/types';
import { Play, Pause, SkipForward, RotateCcw } from 'lucide-react';

interface Props {
  state: PlaybackState;
  onPlay: () => void;
  onPause: () => void;
  onStep: () => void;
  onReset: () => void;
  animationSpeed: number;
  onSpeedChange: (speed: number) => void;
  currentStep: number;
  totalSteps: number;
}

export function PlaybackControls({
  state, onPlay, onPause, onStep, onReset,
  animationSpeed, onSpeedChange, currentStep, totalSteps,
}: Props) {
  const progress = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;

  return (
    <div className="card-elevated p-5 lg:p-6">
      {/* Progress bar */}
      <div className="mb-5">
        <div className="flex justify-between text-[10px] font-mono text-[var(--text-muted)] mb-2">
          <span>Step <span className="text-[var(--accent-bright)]">{Math.min(currentStep, totalSteps)}</span> / {totalSteps}</span>
          <span>{progress.toFixed(0)}%</span>
        </div>
        <div className="h-1 rounded-full overflow-hidden relative" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div
            className="h-full rounded-full transition-all duration-200 relative"
            style={{
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #06b6d4, #3b82f6)',
              boxShadow: '0 0 10px rgba(6,182,212,0.5)',
            }}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Play/Pause */}
        <button
          onClick={state === 'playing' ? onPause : onPlay}
          className="relative flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center text-white transition-all hover:scale-105 active:scale-95"
          style={{
            background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
            boxShadow: '0 4px 24px rgba(6,182,212,0.35), inset 0 1px 0 rgba(255,255,255,0.2)',
          }}
        >
          {state === 'playing' ? <Pause size={22} fill="white" /> : <Play size={22} fill="white" className="ml-1" />}
        </button>

        {/* Step forward */}
        <button
          onClick={onStep}
          disabled={currentStep >= totalSteps}
          className="flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-secondary)' }}
        >
          <SkipForward size={17} />
        </button>

        {/* Reset */}
        <button
          onClick={onReset}
          className="flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-secondary)' }}
        >
          <RotateCcw size={17} />
        </button>

        {/* Divider */}
        <div className="w-px h-8 bg-white/5 mx-1" />

        {/* Speed slider */}
        <div className="flex-1 flex items-center gap-3">
          <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider whitespace-nowrap">Speed</span>
          <input
            type="range"
            min={0.25}
            max={4}
            step={0.25}
            value={animationSpeed}
            onChange={e => onSpeedChange(parseFloat(e.target.value))}
            className="flex-1"
          />
          <span className="text-xs font-mono text-[var(--accent-bright)] w-10 text-right font-semibold">{animationSpeed}x</span>
        </div>
      </div>
    </div>
  );
}
