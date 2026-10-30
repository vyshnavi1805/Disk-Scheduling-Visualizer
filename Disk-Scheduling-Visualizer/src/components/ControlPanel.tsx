import { useState, useEffect } from 'react';
import type { Algorithm, Direction, SeekModel, VisualizerInput } from '@/types';
import { ALGORITHMS, ALGORITHM_INFO, computeSeekB, reconcileRequests } from '@/lib/algorithms';
import { ALGO_COLORS } from '@/lib/palette';
import { NumberField } from './NumberField';
import { ChevronDown, Shuffle, RotateCcw, SlidersHorizontal, Info } from 'lucide-react';

interface Props {
  input: VisualizerInput;
  onChange: (input: VisualizerInput) => void;
  algorithm: Algorithm;
  onAlgorithmChange: (algo: Algorithm) => void;
  onShuffle: () => void;
  onReset: () => void;
}

// Keeps every non-negative integer, even ones beyond the current disk: those are ignored
// by the simulation (and flagged below) rather than deleted, so shrinking the disk is undoable.
function parseCylinders(text: string): number[] {
  return text
    .split(/[,\s]+/)
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n) && n >= 0);
}

export function ControlPanel({ input, onChange, algorithm, onAlgorithmChange, onShuffle, onReset }: Props) {
  const cylinderKey = input.requests.map(r => r.cylinder).join(', ');
  const [requestsText, setRequestsText] = useState(cylinderKey);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const maxCylinder = Math.max(1, input.diskSize - 1);

  // Sync from outside changes (Shuffle, Reset), but don't overwrite text that already
  // parses to the same queue, so typing a trailing comma isn't eaten.
  useEffect(() => {
    setRequestsText(t => (parseCylinders(t).join(', ') === cylinderKey ? t : cylinderKey));
  }, [cylinderKey]);

  const handleRequestsChange = (text: string) => {
    setRequestsText(text);
    onChange({ ...input, requests: reconcileRequests(input.requests, parseCylinders(text)) });
  };

  const fullStroke = maxCylinder * input.seekRate;
  const outside = input.requests.filter(r => r.cylinder > maxCylinder).length;
  const headOutside = input.headStart > maxCylinder;

  const inputCls = "w-full px-3.5 py-2.5 rounded-xl text-sm font-mono transition-all focus:outline-none";
  const inputStyle = {
    background: 'rgba(8,13,26,0.6)',
    border: '1px solid rgba(255,255,255,0.06)',
    color: 'var(--text-primary)',
  };

  return (
    <div className="card-elevated p-5 lg:p-6 space-y-5">
      {/* Algorithm Selection */}
      <div>
        <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.15em] mb-3 block">
          Scheduling Algorithm
        </label>
        <div className="grid grid-cols-4 gap-2">
          {ALGORITHMS.map(algo => {
            const active = algorithm === algo;
            const color = ALGO_COLORS[algo];
            return (
              <button
                key={algo}
                onClick={() => onAlgorithmChange(algo)}
                className="relative px-2 py-3 rounded-xl text-[10px] font-bold transition-all duration-200 overflow-hidden"
                style={{
                  background: active ? `${color}18` : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${active ? color + '60' : 'rgba(255,255,255,0.06)'}`,
                  color: active ? color : 'var(--text-muted)',
                  boxShadow: active ? `0 0 16px ${color}20` : 'none',
                }}
              >
                {active && (
                  <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
                )}
                {algo}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-[var(--text-muted)] mt-3 leading-relaxed">
          {ALGORITHM_INFO[algorithm].description}
        </p>
      </div>

      {/* Request Queue */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.15em]">
            Request Queue
          </label>
          <span className="text-[10px] font-mono text-[var(--text-muted)]">
            Valid: 0 – {maxCylinder}
          </span>
        </div>
        <input
          type="text"
          value={requestsText}
          onChange={e => handleRequestsChange(e.target.value)}
          placeholder="98, 183, 37, 122, 14, 124, 65, 67"
          className={inputCls}
          style={inputStyle}
          onFocus={(e) => e.currentTarget.style.borderColor = 'rgba(6,182,212,0.4)'}
          onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
        />
        <div className="flex gap-2 mt-2">
          <button
            onClick={onShuffle}
            className="btn-glow flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-[11px] font-semibold transition-all"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}
          >
            <Shuffle size={13} /> Shuffle
          </button>
          <button
            onClick={onReset}
            className="btn-glow flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-[11px] font-semibold transition-all"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}
          >
            <RotateCcw size={13} /> Reset
          </button>
        </div>
      </div>

      {/* Basic Parameters */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 block">
            Head Start (0–{maxCylinder})
          </label>
          <NumberField
            ariaLabel="Head start"
            value={input.headStart}
            min={0}
            max={maxCylinder}
            onChange={v => onChange({ ...input, headStart: v })}
            className={inputCls}
            style={inputStyle}
          />
        </div>
        <div>
          <label className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 block">
            Disk Size (Total Cyls)
          </label>
          <NumberField
            ariaLabel="Disk size"
            value={input.diskSize}
            min={2}
            max={10000}
            onChange={v => onChange({ ...input, diskSize: v })}
            className={inputCls}
            style={inputStyle}
          />
        </div>
      </div>

      {(outside > 0 || headOutside) && (
        <p className="text-[10px] text-amber-300/80 -mt-2">
          {outside > 0 && `${outside} request${outside > 1 ? 's' : ''} beyond cylinder ${maxCylinder} ignored. `}
          {headOutside && `Head start is past the last cylinder; using ${maxCylinder}. `}
          Make the disk bigger to include them again.
        </p>
      )}

      {/* Direction */}
      {(algorithm === 'SCAN' || algorithm === 'C-SCAN' || algorithm === 'LOOK') && (
        <div>
          <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.15em] mb-2 block">
            Initial Direction
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(['left', 'right'] as Direction[]).map(dir => (
              <button
                key={dir}
                onClick={() => onChange({ ...input, direction: dir })}
                className="px-3 py-2.5 rounded-xl text-xs font-semibold capitalize transition-all"
                style={{
                  background: input.direction === dir ? 'rgba(6,182,212,0.12)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${input.direction === dir ? 'rgba(6,182,212,0.4)' : 'rgba(255,255,255,0.06)'}`,
                  color: input.direction === dir ? 'var(--accent-bright)' : 'var(--text-muted)',
                }}
              >
                {dir === 'right' ? `Right (→ ${maxCylinder})` : 'Left (0 ←)'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* C-SCAN return jump */}
      {algorithm === 'C-SCAN' && (
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.15em]">
            Count return jump
          </span>
          <input
            type="checkbox"
            checked={input.countReturnJump ?? true}
            onChange={e => onChange({ ...input, countReturnJump: e.target.checked })}
          />
        </label>
      )}

      {/* SSTF aging weight */}
      {algorithm === 'SSTF-AGE' && (
        <div>
          <div className="flex justify-between mb-1.5">
            <label className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
              Aging weight (α)
            </label>
            <span className="text-[10px] font-mono text-[var(--accent-bright)]">{input.agingAlpha ?? 0.5} cyl/ms</span>
          </div>
          <input
            type="range"
            min={0}
            max={10}
            step={0.1}
            value={input.agingAlpha ?? 0.5}
            onChange={e => onChange({ ...input, agingAlpha: parseFloat(e.target.value) })}
            className="w-full"
          />
        </div>
      )}

      {/* Advanced Settings */}
      <div>
        <button
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="w-full flex items-center justify-between py-1 text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.15em]"
        >
          <span className="flex items-center gap-1.5"><SlidersHorizontal size={12} /> Physical Disk Modeling</span>
          <ChevronDown size={14} className={`transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
        </button>

        {advancedOpen && (
          <div className="space-y-4 slide-in pt-3 border-t border-white/5 mt-2">
            {/* Seek Model Selector */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                  Seek Time Model
                </label>
                <span className="text-[9px] font-mono text-[var(--accent-bright)]">
                  {input.seekModel === 'curve' ? 'a + b·√d' : 'd · rate'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'curve', label: 'Realistic (a + b·√d)' },
                  { id: 'linear', label: 'Linear (d · rate)' },
                ].map(m => (
                  <button
                    key={m.id}
                    onClick={() => onChange({ ...input, seekModel: m.id as SeekModel })}
                    className="px-2 py-2 rounded-lg text-[10px] font-semibold transition-all text-center"
                    style={{
                      background: (input.seekModel ?? 'curve') === m.id ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${(input.seekModel ?? 'curve') === m.id ? 'rgba(6,182,212,0.4)' : 'rgba(255,255,255,0.06)'}`,
                      color: (input.seekModel ?? 'curve') === m.id ? 'var(--accent-bright)' : 'var(--text-muted)',
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 p-2.5 rounded-lg bg-white/[0.02] border border-white/5 flex gap-2 items-start">
                <Info size={12} className="text-[var(--accent-bright)] shrink-0 mt-0.5" />
                <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
                  {input.seekModel === 'curve'
                    ? 'Curve model: a fixed settle time a plus b·√d. b is chosen so a full stroke takes the same time as in the linear model, so the toggle changes the shape, not the scale.'
                    : 'Linear model: seek time strictly proportional to distance, as most textbooks assume.'}
                </p>
              </div>
            </div>

            {/* Settling overhead a (only in curve mode) */}
            {input.seekModel === 'curve' && (
              <div>
                <div className="flex justify-between mb-1.5">
                  <label className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                    Settling Overhead (a)
                  </label>
                  <span className="text-[10px] font-mono text-[var(--accent-bright)]">{input.seekA ?? 1.0} ms</span>
                </div>
                <input
                  type="range"
                  min={0.2}
                  max={5.0}
                  step={0.1}
                  value={input.seekA ?? 1.0}
                  onChange={e => onChange({ ...input, seekA: parseFloat(e.target.value) })}
                  className="w-full"
                />
              </div>
            )}

            {/* Seek Factor / Rate */}
            <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                  Seek Rate (ms/cyl)
                </label>
                <span className="text-[10px] font-mono text-[var(--accent-bright)]">{input.seekRate}</span>
              </div>
              <input
                type="range"
                min={0.1}
                max={5}
                step={0.1}
                value={input.seekRate}
                onChange={e => onChange({ ...input, seekRate: parseFloat(e.target.value) })}
                className="w-full"
              />
              <span className="text-[9px] text-[var(--text-muted)] block mt-1">
                Full stroke: {fullStroke.toFixed(2)} ms in both models
                {input.seekModel === 'curve' && ` (b = ${computeSeekB(input).toFixed(3)} ms/√cyl)`}
              </span>
            </div>

            {/* RPM */}
            <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Spindle Speed (RPM)</label>
                <span className="text-[10px] font-mono text-[var(--accent-bright)]">{input.rpm.toLocaleString()} RPM</span>
              </div>
              <input
                type="range"
                min={3600}
                max={15000}
                step={100}
                value={input.rpm}
                onChange={e => onChange({ ...input, rpm: parseInt(e.target.value) })}
                className="w-full"
              />
              <span className="text-[9px] text-[var(--text-muted)] block mt-1">
                Rev time: {(60000 / input.rpm).toFixed(2)} ms (Max rot latency)
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
