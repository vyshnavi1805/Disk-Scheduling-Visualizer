import { describe, it, expect } from 'vitest';
import { frameAt, platterAngleAt } from '../playback';
import { ALGORITHMS, runAlgorithm, computePhysicalRotationalLatency } from '../algorithms';
import { generateWorkload, mulberry32 } from '../workloads';
import type { VisualizerInput } from '@/types';

const BASE: VisualizerInput = {
  requests: [],
  headStart: 53,
  diskSize: 200,
  direction: 'right',
  rpm: 7200,
  seekRate: 0.1,
  seekModel: 'curve',
  seekA: 1,
};

/** Smallest angular difference in degrees. */
const angDiff = (a: number, b: number) => {
  const d = (((a - b) % 360) + 360) % 360;
  return Math.min(d, 360 - d);
};

describe('Playback frames match the timing model', () => {
  const rnd = mulberry32(21);
  const inputs = Array.from({ length: 100 }, (_, i) => {
    const w = generateWorkload(i % 2 ? 'uniform' : 'clustered', 15, 200, rnd);
    return { ...BASE, direction: (i % 3 ? 'right' : 'left') as 'right' | 'left', headStart: w.headStart, requests: w.requests };
  });

  it('platterAngleAt agrees with the rotational latency model', () => {
    for (const t of [0, 1.234, 8.333, 50, 1234.5]) {
      const { platterAngle } = computePhysicalRotationalLatency(0, t, 7200);
      expect(platterAngleAt(t, 7200)).toBeCloseTo(platterAngle, 1);
    }
  });

  it("at the end of every step the request's sector is exactly under the head", () => {
    for (const input of inputs) {
      for (const algo of ALGORITHMS) {
        const { steps } = runAlgorithm(algo, input);
        steps.forEach((s, i) => {
          if (s.isBoundary) return;
          const f = frameAt(steps, input.headStart, input.rpm, i, 1);
          expect(angDiff(f.platterAngle, s.sectorAngle!), `${algo} step ${i}`).toBeLessThan(0.01);
          expect(f.cylinder).toBe(s.to);
        });
      }
    }
  });

  it('the head is at the start cylinder at the start of a step, and reaches the target when the seek ends', () => {
    for (const input of inputs.slice(0, 20)) {
      const { steps } = runAlgorithm('SATF', input);
      steps.forEach((s, i) => {
        expect(frameAt(steps, input.headStart, input.rpm, i, 0).cylinder).toBe(s.from);
        const seekEnd = s.seekTime / (s.seekTime + s.rotationalLatency || 1);
        const f = frameAt(steps, input.headStart, input.rpm, i, seekEnd);
        expect(f.cylinder).toBeCloseTo(s.to, 9);
        if (s.rotationalLatency > 0) {
          expect(frameAt(steps, input.headStart, input.rpm, i, (1 + seekEnd) / 2).phase).toBe('rotating');
        }
      });
    }
  });

  it('time is continuous: each step starts when the previous one ended', () => {
    for (const input of inputs.slice(0, 20)) {
      const { steps, totalAccessTime } = runAlgorithm('LOOK', input);
      for (let i = 1; i < steps.length; i++) {
        expect(frameAt(steps, input.headStart, input.rpm, i, 0).timeMs)
          .toBeCloseTo(frameAt(steps, input.headStart, input.rpm, i - 1, 1).timeMs, 9);
      }
      expect(frameAt(steps, input.headStart, input.rpm, steps.length, 0).timeMs).toBeCloseTo(totalAccessTime, 9);
    }
  });

  it('handles no steps, and the finished state', () => {
    expect(frameAt([], 40, 7200, 0, 0)).toMatchObject({ cylinder: 40, phase: 'idle', timeMs: 0 });
    const { steps } = runAlgorithm('FCFS', { ...BASE, requests: [{ id: 0, cylinder: 120, sector: 90, arrivalTime: 0 }] });
    expect(frameAt(steps, 53, 7200, 1, 0)).toMatchObject({ cylinder: 120, phase: 'done' });
  });
});
