import { describe, it, expect } from 'vitest';
import { runAlgorithm, computeSeekTime, computeSeekB, computePhysicalRotationalLatency, makeRequests, reconcileRequests } from '../algorithms';
import type { VisualizerInput } from '@/types';

const CLASSIC_INPUT: VisualizerInput = {
  requests: makeRequests([98, 183, 37, 122, 14, 124, 65, 67]),
  headStart: 53,
  diskSize: 200, // Cylinders 0 - 199
  direction: 'right',
  rpm: 7200,
  seekRate: 1,
  seekModel: 'linear',
};

describe('Disk Scheduling Algorithms - Textbook Verification', () => {
  it('FCFS services requests in exact arrival order with total seek 640', () => {
    const result = runAlgorithm('FCFS', CLASSIC_INPUT);
    expect(result.serviceOrder).toEqual([98, 183, 37, 122, 14, 124, 65, 67]);
    expect(result.totalSeekDistance).toBe(640);
  });

  it('SSTF picks closest pending cylinder with total seek 236', () => {
    const result = runAlgorithm('SSTF', CLASSIC_INPUT);
    expect(result.serviceOrder).toEqual([65, 67, 37, 14, 98, 122, 124, 183]);
    expect(result.totalSeekDistance).toBe(236);
  });

  describe('SCAN (Elevator)', () => {
    it('SCAN right sweeps to maxCylinder (199), then reverses to 14, total seek 331', () => {
      const result = runAlgorithm('SCAN', { ...CLASSIC_INPUT, direction: 'right' });
      expect(result.serviceOrder).toEqual([65, 67, 98, 122, 124, 183, 199, 37, 14]);
      expect(result.totalSeekDistance).toBe(331);
    });

    it('SCAN left sweeps down to 0, then reverses to 183, total seek 236', () => {
      const result = runAlgorithm('SCAN', { ...CLASSIC_INPUT, direction: 'left' });
      expect(result.serviceOrder).toEqual([37, 14, 0, 65, 67, 98, 122, 124, 183]);
      expect(result.totalSeekDistance).toBe(236);
    });
  });

  describe('C-SCAN (Circular SCAN)', () => {
    it('C-SCAN right sweeps to 199, jumps to 0, and sweeps right (14, 37), total seek 382', () => {
      // Textbook classic: (199 - 53) + (199 - 0) + (37 - 0) = 146 + 199 + 37 = 382
      const result = runAlgorithm('C-SCAN', { ...CLASSIC_INPUT, direction: 'right' });
      expect(result.serviceOrder).toEqual([65, 67, 98, 122, 124, 183, 199, 0, 14, 37]);
      expect(result.totalSeekDistance).toBe(382);
    });

    it('C-SCAN right average seek divides by the 8 real requests, not the 10 steps (382 / 8 = 47.75)', () => {
      const result = runAlgorithm('C-SCAN', { ...CLASSIC_INPUT, direction: 'right' });
      expect(result.avgSeekDistance).toBe(47.75);
    });

    it('C-SCAN left sweeps to 0, jumps to 199, and sweeps left in DESCENDING order (183, 124, 122, 98, 67, 65), total seek 386', () => {
      // Sweeping left: (53 - 0) + (199 - 0) + (199 - 65) = 53 + 199 + 134 = 386
      const result = runAlgorithm('C-SCAN', { ...CLASSIC_INPUT, direction: 'left' });
      expect(result.serviceOrder).toEqual([37, 14, 0, 199, 183, 124, 122, 98, 67, 65]);
      expect(result.totalSeekDistance).toBe(386);
    });
  });

  describe('LOOK', () => {
    it('LOOK right only sweeps to 183, then reverses to 14, total seek 299', () => {
      const result = runAlgorithm('LOOK', { ...CLASSIC_INPUT, direction: 'right' });
      expect(result.serviceOrder).toEqual([65, 67, 98, 122, 124, 183, 37, 14]);
      expect(result.totalSeekDistance).toBe(299);
    });

    it('LOOK left only sweeps to 14, then reverses to 183, total seek 208', () => {
      const result = runAlgorithm('LOOK', { ...CLASSIC_INPUT, direction: 'left' });
      expect(result.serviceOrder).toEqual([37, 14, 65, 67, 98, 122, 124, 183]);
      expect(result.totalSeekDistance).toBe(208);
    });
  });
});

describe('Physical Modeling Verification', () => {
  it('Boundary stops have 0 rotational latency and null sectorAngle', () => {
    const result = runAlgorithm('C-SCAN', { ...CLASSIC_INPUT, direction: 'right' });
    const boundarySteps = result.steps.filter(s => s.isBoundary);
    expect(boundarySteps.length).toBe(2); // 199 and 0
    boundarySteps.forEach(s => {
      expect(s.rotationalLatency).toBe(0);
      expect(s.sectorAngle).toBeNull();
    });
  });

  it('Rotational latency is deterministic and workload sectors are shared across algorithms', () => {
    const fcfs = runAlgorithm('FCFS', CLASSIC_INPUT);
    const sstf = runAlgorithm('SSTF', CLASSIC_INPUT);

    // Run again to ensure no Math.random() jitter
    const fcfsRepeat = runAlgorithm('FCFS', CLASSIC_INPUT);
    expect(fcfs.totalAccessTime).toBe(fcfsRepeat.totalAccessTime);
    expect(fcfs.avgRotationalLatency).toBe(fcfsRepeat.avgRotationalLatency);

    // Every request id should have the same sector angle regardless of algorithm
    const fcfsSectorsById = new Map(fcfs.steps.map(s => [s.requestId, s.sectorAngle]));
    sstf.steps.forEach(s => {
      if (!s.isBoundary) {
        expect(s.sectorAngle).toBe(fcfsSectorsById.get(s.requestId));
      }
    });
  });

  it('Rotational latency accounts for platter arrival angle', () => {
    // Platter at 7200 RPM completes 1 rev every 60000/7200 = 8.333ms (43.2 deg/ms)
    // If head arrives when platter is at 90°, and target sector is at 180°, wait is 90° (2.083ms)
    const degPerMs = (360 * 7200) / 60000;
    const arrivalTime = 90 / degPerMs; // Platter will be at exactly 90 deg
    const { latencyMs, platterAngle } = computePhysicalRotationalLatency(180, arrivalTime, 7200);

    expect(platterAngle).toBeCloseTo(90, 1);
    expect(latencyMs).toBeCloseTo((90 / 360) * (60000 / 7200), 2);
  });

  it('Seek models: t(0) = 0, and the curve is calibrated to the same full-stroke time as linear', () => {
    const linearInput: VisualizerInput = { ...CLASSIC_INPUT, seekModel: 'linear', seekRate: 1 };
    const curveInput: VisualizerInput = { ...CLASSIC_INPUT, seekModel: 'curve', seekA: 1.0, seekRate: 1 };

    expect(computeSeekTime(0, linearInput)).toBe(0);
    expect(computeSeekTime(0, curveInput)).toBe(0);

    // Full stroke (0 -> 199) takes 199 ms in both models
    expect(computeSeekTime(199, linearInput)).toBe(199);
    expect(computeSeekTime(199, curveInput)).toBeCloseTo(199, 9);

    // b = (199 * 1 - 1) / sqrt(199)
    expect(computeSeekB(curveInput)).toBeCloseTo(198 / Math.sqrt(199), 9);

    // Same endpoints, different shape: short hops cost more under the curve
    expect(computeSeekTime(1, curveInput)).toBeGreaterThan(computeSeekTime(1, linearInput));
    expect(computeSeekTime(16, curveInput) * 2).toBeGreaterThan(computeSeekTime(32, curveInput));
  });

  it('C-SCAN return jump toggle: off gives 382 - 199 = 183 for C-SCAN right', () => {
    const on = runAlgorithm('C-SCAN', { ...CLASSIC_INPUT, direction: 'right' });
    const off = runAlgorithm('C-SCAN', { ...CLASSIC_INPUT, direction: 'right', countReturnJump: false });
    expect(on.totalSeekDistance).toBe(382);
    expect(off.totalSeekDistance).toBe(183);
    expect(off.seekTime).toBe(183);
    expect(off.serviceOrder).toEqual(on.serviceOrder);
  });
});

describe('Request model', () => {
  it('rejects requests outside 0..diskSize-1', () => {
    const result = runAlgorithm('FCFS', { ...CLASSIC_INPUT, requests: makeRequests([10, 200, -1, 199]) });
    expect(result.serviceOrder).toEqual([10, 199]);
  });

  it('editing the queue keeps id and sector of unchanged requests and is reproducible', () => {
    const prev = makeRequests([98, 183, 37]);
    const next = reconcileRequests(prev, [98, 50, 37]);
    expect(next[0]).toBe(prev[0]);
    expect(next[2]).toBe(prev[2]);
    expect(next[1].id).toBe(1);
    expect(next).toEqual(makeRequests([98, 50, 37]));
  });
});

describe('SSTF with aging', () => {
  it('is identical to SSTF in a static batch (all requests have waited equally long)', () => {
    const sstf = runAlgorithm('SSTF', CLASSIC_INPUT);
    const aged = runAlgorithm('SSTF-AGE', { ...CLASSIC_INPUT, agingAlpha: 5 });
    expect(aged.serviceOrder).toEqual(sstf.serviceOrder);
  });

  it('promotes a long-waiting far request once waits differ', () => {
    // rpm 0 disables rotation so the arithmetic is pure seek: head 50, linear 1 ms/cyl.
    // After serving 52 at t = 2 ms: 55 has waited 0 ms (arrives at 1000), 20 has waited 2 ms.
    // Priority of 20 = 32 - 20 * 2 = -8 beats 55 = 3 - 0 = 3.
    const input: VisualizerInput = {
      ...CLASSIC_INPUT,
      rpm: 0,
      headStart: 50,
      requests: [
        { id: 0, cylinder: 52, sector: 0, arrivalTime: 0 },
        { id: 1, cylinder: 55, sector: 0, arrivalTime: 1000 },
        { id: 2, cylinder: 20, sector: 0, arrivalTime: 0 },
      ],
    };
    expect(runAlgorithm('SSTF', input).serviceOrder).toEqual([52, 55, 20]);
    expect(runAlgorithm('SSTF-AGE', { ...input, agingAlpha: 20 }).serviceOrder).toEqual([52, 20, 55]);
  });
});

describe('SATF', () => {
  it('beats SSTF on total access time when the nearest sector has just passed', () => {
    // Workload: head 100, linear seek 0.1 ms/cyl, 6000 RPM (10 ms/rev, 36 deg/ms)
    //   A: cylinder 101, sector 0deg    B: cylinder 110, sector 90deg
    // SSTF: A (seek 0.1, arrive at 3.6deg, wait 356.4deg = 9.9) then B (seek 0.9, wait 1.6) = 12.5 ms
    // SATF: B (seek 1.0, wait 1.5) then A (seek 0.9, wait 6.6)                             = 10.0 ms
    const input: VisualizerInput = {
      ...CLASSIC_INPUT,
      headStart: 100,
      seekModel: 'linear',
      seekRate: 0.1,
      rpm: 6000,
      requests: [
        { id: 0, cylinder: 101, sector: 0, arrivalTime: 0 },
        { id: 1, cylinder: 110, sector: 90, arrivalTime: 0 },
      ],
    };
    const sstf = runAlgorithm('SSTF', input);
    const satf = runAlgorithm('SATF', input);
    expect(sstf.serviceOrder).toEqual([101, 110]);
    expect(satf.serviceOrder).toEqual([110, 101]);
    expect(sstf.totalAccessTime).toBeCloseTo(12.5, 6);
    expect(satf.totalAccessTime).toBeCloseTo(10.0, 6);
    expect(satf.totalAccessTime).toBeLessThan(sstf.totalAccessTime);
  });
});
