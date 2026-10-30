import type { Algorithm, AlgorithmResult, DiskRequest, SeekStep, VisualizerInput } from '@/types';

export interface TargetHop {
  target: number;
  isBoundary: boolean;
  isReturnJump?: boolean;
  sectorAngle: number | null;
  requestId: number | null;
}

/**
 * Deterministic sector angle [0, 360) for a request, derived from its cylinder and id.
 * Being a function of the request (not of service order) means every algorithm sees
 * the same physical workload.
 */
export function deterministicSector(cylinder: number, id: number): number {
  return ((cylinder * 137 + (id + 1) * 73) % 3600) / 10;
}

/** Builds requests from a list of cylinders, assigning ids from startId and deterministic sectors. */
export function makeRequests(cylinders: number[], startId = 0): DiskRequest[] {
  return cylinders.map((cylinder, i) => {
    const id = startId + i;
    return { id, cylinder, sector: deterministicSector(cylinder, id), arrivalTime: 0 };
  });
}

/**
 * Rebuilds the request list after the user edits the cylinder text. A request whose
 * cylinder is unchanged at the same position keeps its id and sector; a changed one
 * gets the smallest free id, so the same text always yields the same workload.
 */
export function reconcileRequests(prev: DiskRequest[], cylinders: number[]): DiskRequest[] {
  const kept = cylinders.map((cylinder, i) => (prev[i] && prev[i].cylinder === cylinder ? prev[i] : null));
  const used = new Set(kept.filter((r): r is DiskRequest => r !== null).map(r => r.id));
  let nextId = 0;
  return cylinders.map((cylinder, i) => {
    const old = kept[i];
    if (old) return old;
    while (used.has(nextId)) nextId++;
    const id = nextId;
    used.add(id);
    return { id, cylinder, sector: deterministicSector(cylinder, id), arrivalTime: 0 };
  });
}

export function maxCylinderOf(input: VisualizerInput): number {
  return Math.max(0, input.diskSize - 1);
}

/**
 * Curve-model coefficient b, calibrated so both models agree on full-stroke time:
 *   a + b * sqrt(maxCyl) = maxCyl * seekRate   =>   b = (maxCyl * seekRate - a) / sqrt(maxCyl)
 * Without this, switching models only rescales every result and says nothing about
 * which algorithm is better. If a exceeds the full-stroke time, b is clamped to 0.
 */
export function computeSeekB(input: VisualizerInput): number {
  const maxCyl = maxCylinderOf(input);
  if (maxCyl <= 0) return 0;
  const a = input.seekA ?? 1.0;
  return Math.max(0, (maxCyl * input.seekRate - a) / Math.sqrt(maxCyl));
}

/**
 * Seek time model:
 * 1. Curve model: t = a + b * sqrt(d) for d > 0 (a = settle time, b calibrated by computeSeekB)
 * 2. Textbook linear model: t = d * seekRate
 * Both give t(0) = 0.
 */
export function computeSeekTime(distance: number, input: VisualizerInput): number {
  if (distance === 0) return 0;
  if (input.seekModel === 'curve') {
    return (input.seekA ?? 1.0) + computeSeekB(input) * Math.sqrt(distance);
  }
  return distance * input.seekRate;
}

/**
 * Physical rotational latency model:
 * Calculates the exact angular delay until the requested sector on the rotating platter
 * reaches the read/write head position after head arrival.
 * Boundary stops (track turnarounds or reset jumps) do not service data and incur 0ms latency.
 */
export function computePhysicalRotationalLatency(
  targetSector: number | null,
  arrivalTimeMs: number,
  rpm: number
): { latencyMs: number; platterAngle: number } {
  if (targetSector === null || rpm <= 0) {
    return { latencyMs: 0, platterAngle: 0 };
  }
  const degPerMs = (360 * rpm) / 60000;
  const rotationTimeMs = 60000 / rpm;
  const currentPlatterAngle = (arrivalTimeMs * degPerMs) % 360;

  let deltaDeg = (targetSector - currentPlatterAngle) % 360;
  if (deltaDeg < 0) deltaDeg += 360;
  if (deltaDeg < 0.001) deltaDeg = 0;

  const latencyMs = (deltaDeg / 360) * rotationTimeMs;
  return { latencyMs, platterAngle: Math.round(currentPlatterAngle * 10) / 10 };
}

function buildSteps(hops: TargetHop[], input: VisualizerInput): SeekStep[] {
  const steps: SeekStep[] = [];
  const countReturnJump = input.countReturnJump ?? true;
  let cumulative = 0;
  let prev = input.headStart;
  let currentTimeMs = 0;

  for (let i = 0; i < hops.length; i++) {
    const { target, isBoundary, isReturnJump, sectorAngle, requestId } = hops[i];
    // An uncounted return jump is treated as free: no distance and no seek time.
    const counted = !(isReturnJump && !countReturnJump);
    const distance = counted ? Math.abs(target - prev) : 0;
    cumulative += distance;

    const stepSeekTime = computeSeekTime(distance, input);
    const arrivalTimeMs = currentTimeMs + stepSeekTime;

    let stepRotLatency = 0;
    let platterAngle = 0;

    if (!isBoundary && sectorAngle !== null) {
      const rot = computePhysicalRotationalLatency(sectorAngle, arrivalTimeMs, input.rpm);
      stepRotLatency = rot.latencyMs;
      platterAngle = rot.platterAngle;
    }

    steps.push({
      from: prev,
      to: target,
      distance,
      cumulativeDistance: cumulative,
      startTime: currentTimeMs,
      seekTime: stepSeekTime,
      sectorAngle,
      rotationalLatency: stepRotLatency,
      isBoundary,
      isReturnJump,
      requestId,
      index: i,
      platterAngleAtArrival: platterAngle,
    });

    currentTimeMs = arrivalTimeMs + stepRotLatency;
    prev = target;
  }

  return steps;
}

function summarize(algorithm: Algorithm, hops: TargetHop[], steps: SeekStep[]): AlgorithmResult {
  const serviceOrder = hops.map(h => h.target);
  const totalSeekDistance = steps.reduce((s, st) => s + st.distance, 0);
  const seekTime = steps.reduce((s, st) => s + st.seekTime, 0);

  // Per-request averages divide by real requests only; boundary hops still add distance.
  const realRequestSteps = steps.filter(st => !st.isBoundary);
  const avgSeekDistance = realRequestSteps.length > 0 ? totalSeekDistance / realRequestSteps.length : 0;
  const totalRotLatency = steps.reduce((s, st) => s + st.rotationalLatency, 0);
  const avgRotationalLatency = realRequestSteps.length > 0
    ? totalRotLatency / realRequestSteps.length
    : 0;
  const totalAccessTime = seekTime + totalRotLatency;

  return {
    algorithm,
    serviceOrder,
    steps,
    totalSeekDistance,
    seekTime,
    avgSeekDistance,
    avgRotationalLatency,
    totalAccessTime,
  };
}

const toHop = (r: DiskRequest): TargetHop => ({
  target: r.cylinder,
  isBoundary: false,
  sectorAngle: r.sector,
  requestId: r.id,
});

const boundaryHop = (target: number, isReturnJump = false): TargetHop => ({
  target,
  isBoundary: true,
  isReturnJump,
  sectorAngle: null,
  requestId: null,
});

/**
 * Greedy scheduler that tracks head position and simulated time, so cost functions
 * can depend on where the platter is (SATF) or how long a request has waited (SSTF-AGE).
 * Ties go to the request that appears first in the input queue.
 */
function greedyOrder(
  requests: DiskRequest[],
  input: VisualizerInput,
  cost: (r: DiskRequest, pos: number, timeMs: number) => number
): TargetHop[] {
  const remaining = [...requests];
  const hops: TargetHop[] = [];
  let pos = input.headStart;
  let timeMs = 0;

  while (remaining.length > 0) {
    let best = 0;
    let bestCost = cost(remaining[0], pos, timeMs);
    for (let i = 1; i < remaining.length; i++) {
      const c = cost(remaining[i], pos, timeMs);
      if (c < bestCost) {
        best = i;
        bestCost = c;
      }
    }
    const next = remaining.splice(best, 1)[0];
    hops.push(toHop(next));

    const arrival = timeMs + computeSeekTime(Math.abs(next.cylinder - pos), input);
    timeMs = arrival + computePhysicalRotationalLatency(next.sector, arrival, input.rpm).latencyMs;
    pos = next.cylinder;
  }

  return hops;
}

export function runAlgorithm(algorithm: Algorithm, input: VisualizerInput): AlgorithmResult {
  const { headStart, direction } = input;
  const maxCylinder = maxCylinderOf(input);

  // Requests outside 0..diskSize-1 (or non-integer cylinders) are rejected, not clamped.
  const items = (input.requests ?? []).filter(
    r => Number.isInteger(r.cylinder) && r.cylinder >= 0 && r.cylinder <= maxCylinder
  );

  if (items.length === 0) {
    return summarize(algorithm, [], []);
  }

  const ascending = (a: DiskRequest, b: DiskRequest) => a.cylinder - b.cylinder;
  const descending = (a: DiskRequest, b: DiskRequest) => b.cylinder - a.cylinder;

  let hops: TargetHop[];

  switch (algorithm) {
    case 'FCFS':
      hops = items.map(toHop);
      break;

    case 'SSTF':
      hops = greedyOrder(items, input, (r, pos) => Math.abs(r.cylinder - pos));
      break;

    case 'SSTF-AGE': {
      const alpha = input.agingAlpha ?? 0.5;
      hops = greedyOrder(
        items,
        input,
        (r, pos, t) => Math.abs(r.cylinder - pos) - alpha * Math.max(0, t - r.arrivalTime)
      );
      break;
    }

    case 'SATF':
      hops = greedyOrder(items, input, (r, pos, t) => {
        const arrival = t + computeSeekTime(Math.abs(r.cylinder - pos), input);
        return arrival - t + computePhysicalRotationalLatency(r.sector, arrival, input.rpm).latencyMs;
      });
      break;

    case 'SCAN': {
      hops = [];
      if (direction === 'right') {
        const right = items.filter(r => r.cylinder >= headStart).sort(ascending);
        const left = items.filter(r => r.cylinder < headStart).sort(descending);
        hops.push(...right.map(toHop));
        if (left.length > 0) {
          const reachedMax = right.length > 0 && right[right.length - 1].cylinder === maxCylinder;
          if (!reachedMax) hops.push(boundaryHop(maxCylinder));
          hops.push(...left.map(toHop));
        }
      } else {
        const left = items.filter(r => r.cylinder <= headStart).sort(descending);
        const right = items.filter(r => r.cylinder > headStart).sort(ascending);
        hops.push(...left.map(toHop));
        if (right.length > 0) {
          const reachedZero = left.length > 0 && left[left.length - 1].cylinder === 0;
          if (!reachedZero) hops.push(boundaryHop(0));
          hops.push(...right.map(toHop));
        }
      }
      break;
    }

    case 'C-SCAN': {
      hops = [];
      if (direction === 'right') {
        const right = items.filter(r => r.cylinder >= headStart).sort(ascending);
        const left = items.filter(r => r.cylinder < headStart).sort(ascending);
        hops.push(...right.map(toHop));
        if (left.length > 0) {
          const reachedMax = right.length > 0 && right[right.length - 1].cylinder === maxCylinder;
          if (!reachedMax) hops.push(boundaryHop(maxCylinder));
          // Return jump to cylinder 0, then keep sweeping right (ascending)
          hops.push(boundaryHop(0, true));
          hops.push(...left.map(toHop));
        }
      } else {
        const left = items.filter(r => r.cylinder <= headStart).sort(descending);
        // Sweeping left means descending order on both passes
        const right = items.filter(r => r.cylinder > headStart).sort(descending);
        hops.push(...left.map(toHop));
        if (right.length > 0) {
          const reachedZero = left.length > 0 && left[left.length - 1].cylinder === 0;
          if (!reachedZero) hops.push(boundaryHop(0));
          // Return jump to maxCylinder, then keep sweeping left (descending)
          hops.push(boundaryHop(maxCylinder, true));
          hops.push(...right.map(toHop));
        }
      }
      break;
    }

    case 'LOOK': {
      if (direction === 'right') {
        const right = items.filter(r => r.cylinder >= headStart).sort(ascending);
        const left = items.filter(r => r.cylinder < headStart).sort(descending);
        hops = [...right, ...left].map(toHop);
      } else {
        const left = items.filter(r => r.cylinder <= headStart).sort(descending);
        const right = items.filter(r => r.cylinder > headStart).sort(ascending);
        hops = [...left, ...right].map(toHop);
      }
      break;
    }

    default:
      hops = [];
  }

  return summarize(algorithm, hops, buildSteps(hops, input));
}

export const ALGORITHMS: Algorithm[] = ['FCFS', 'SSTF', 'SSTF-AGE', 'SATF', 'SCAN', 'C-SCAN', 'LOOK'];

export const ALGORITHM_INFO: Record<Algorithm, { name: string; fullName: string; description: string }> = {
  FCFS: {
    name: 'FCFS',
    fullName: 'First-Come, First-Served',
    description: 'Requests are serviced in the exact arrival order. Simple and fair, but produces the largest total seek distance.',
  },
  SSTF: {
    name: 'SSTF',
    fullName: 'Shortest Seek Time First',
    description: 'Services the closest request to the current head position. Minimizes each immediate seek, but ignores rotation and can starve far requests.',
  },
  'SSTF-AGE': {
    name: 'SSTF-AGE',
    fullName: 'SSTF with Aging',
    description: 'SSTF where priority = distance − α × waiting time, so long-waiting requests eventually win. In a static batch every request has waited equally long, so it behaves exactly like SSTF; aging only matters once requests arrive over time.',
  },
  SATF: {
    name: 'SATF',
    fullName: 'Shortest Access Time First',
    description: 'Picks the request with the smallest seek time + rotational wait, using where the platter will actually be when the head arrives. A nearby request whose sector just passed can cost a full revolution, so SATF may skip it.',
  },
  SCAN: {
    name: 'SCAN',
    fullName: 'Elevator (SCAN)',
    description: 'Sweeps in one direction to the disk boundary (0 or diskSize - 1), servicing requests along the path, then reverses direction.',
  },
  'C-SCAN': {
    name: 'C-SCAN',
    fullName: 'Circular SCAN',
    description: 'Sweeps in one direction to the boundary, returns to the opposite end via an unserviced reset jump, and continues sweeping in the same direction for uniform wait times.',
  },
  LOOK: {
    name: 'LOOK',
    fullName: 'LOOK',
    description: 'Like SCAN, but reverses immediately at the furthest pending request in the current direction rather than traveling all the way to the disk boundary.',
  },
};
