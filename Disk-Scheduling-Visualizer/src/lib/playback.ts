import type { SeekStep } from '@/types';

export type Phase = 'idle' | 'seeking' | 'rotating' | 'done';

export interface PlaybackFrame {
  timeMs: number; // simulation time
  cylinder: number; // head position (fractional while seeking)
  seekProgress: number; // 0..1 through the current step's seek
  platterAngle: number; // degrees [0, 360): which sector is under the head right now
  phase: Phase;
  step: SeekStep | null;
}

/** Platter angle at simulation time t, matching computePhysicalRotationalLatency. */
export function platterAngleAt(timeMs: number, rpm: number): number {
  if (rpm <= 0) return 0;
  const a = (timeMs * (360 * rpm) / 60000) % 360;
  return a < 0 ? a + 360 : a;
}

/**
 * Where everything is at a point of playback. Each step plays as its seek followed by
 * its rotational wait, split in proportion to their durations, so the head reaches the
 * track first and then waits for the sector to come round.
 */
export function frameAt(
  steps: SeekStep[],
  headStart: number,
  rpm: number,
  currentStep: number,
  progress: number
): PlaybackFrame {
  if (steps.length === 0) {
    return { timeMs: 0, cylinder: headStart, seekProgress: 0, platterAngle: 0, phase: 'idle', step: null };
  }
  if (currentStep >= steps.length) {
    const last = steps[steps.length - 1];
    const end = last.startTime + last.seekTime + last.rotationalLatency;
    return { timeMs: end, cylinder: last.to, seekProgress: 1, platterAngle: platterAngleAt(end, rpm), phase: 'done', step: last };
  }

  const step = steps[currentStep];
  const duration = step.seekTime + step.rotationalLatency;
  const p = Math.min(1, Math.max(0, progress));
  const elapsed = p * duration;
  const timeMs = step.startTime + elapsed;
  // A step with no seek time (same cylinder) is "arrived" from the start.
  const seekProgress = step.seekTime > 0 ? Math.min(1, elapsed / step.seekTime) : duration > 0 ? 1 : p;
  const cylinder = step.from + (step.to - step.from) * seekProgress;
  const phase: Phase = currentStep === 0 && p === 0 ? 'idle' : seekProgress < 1 ? 'seeking' : 'rotating';

  return { timeMs, cylinder, seekProgress, platterAngle: platterAngleAt(timeMs, rpm), phase, step };
}
