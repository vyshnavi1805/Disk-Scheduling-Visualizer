export type Algorithm = 'FCFS' | 'SSTF' | 'SSTF-AGE' | 'SATF' | 'SCAN' | 'C-SCAN' | 'LOOK';
export type Direction = 'left' | 'right';
export type PlaybackState = 'idle' | 'playing' | 'paused';
export type SeekModel = 'curve' | 'linear';

// Named DiskRequest (not Request) to avoid shadowing the DOM's global Request type.
export interface DiskRequest {
  id: number; // stable identity; the sector belongs to the request, not to its service position
  cylinder: number;
  sector: number; // sector angle in degrees [0, 360)
  arrivalTime: number; // ms; 0 for a static batch
}

export interface VisualizerInput {
  requests: DiskRequest[];
  headStart: number;
  diskSize: number; // total cylinder count (cylinders 0 to diskSize - 1)
  direction: Direction;
  rpm: number;
  seekRate: number; // ms per cylinder in the linear model; also fixes the full-stroke time of the curve model
  seekModel?: SeekModel; // 'curve' (a + b*sqrt(d)) or 'linear' (d * seekRate)
  seekA?: number; // curve model settle time in ms (default 1.0); b is derived, see computeSeekB
  countReturnJump?: boolean; // C-SCAN: include the end-to-end return jump in seek distance/time (default true)
  agingAlpha?: number; // SSTF-AGE: cylinders of priority gained per ms of waiting (default 0.5)
}

export interface SeekStep {
  from: number;
  to: number;
  distance: number; // counted distance (0 for an uncounted C-SCAN return jump)
  cumulativeDistance: number;
  startTime: number; // simulation time when this hop begins (ms)
  seekTime: number; // seek time for this specific hop (ms)
  sectorAngle: number | null; // null for boundary stops; target sector angle in degrees [0, 360)
  rotationalLatency: number; // 0 for boundary stops; time waited for target sector to align (ms)
  isBoundary?: boolean; // true for turnaround (SCAN) or track jump (C-SCAN) stops
  isReturnJump?: boolean; // true for the C-SCAN end-to-end jump
  requestId: number | null; // null for boundary stops
  index: number;
  platterAngleAtArrival?: number; // angle of platter when head arrived at track
}

export interface AlgorithmResult {
  algorithm: Algorithm;
  serviceOrder: number[];
  steps: SeekStep[];
  totalSeekDistance: number;
  seekTime: number;
  avgSeekDistance: number;
  avgRotationalLatency: number;
  totalAccessTime: number;
}
