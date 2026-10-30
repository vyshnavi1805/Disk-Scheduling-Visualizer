import type { DiskRequest } from '@/types';

export type WorkloadKind = 'uniform' | 'sequential' | 'zipf' | 'clustered';

export interface Workload {
  headStart: number;
  requests: DiskRequest[];
}

export const WORKLOAD_INFO: Record<WorkloadKind, { label: string; description: string }> = {
  uniform: {
    label: 'Uniform',
    description: 'Cylinders and sectors uniformly random. The textbook assumption.',
  },
  sequential: {
    label: 'Sequential',
    description: '1–3 interleaved streams reading consecutive cylinders, each next block 30° further round the platter.',
  },
  zipf: {
    label: 'Zipf hot spots',
    description: 'Disk split into 20 regions; region popularity follows Zipf (s = 1.2), so a few regions get most requests.',
  },
  clustered: {
    label: 'Clustered',
    description: '2–4 tight clusters of requests (±5 cylinders), like a few files being accessed at once.',
  },
};

/** Seeded PRNG (mulberry32). Same seed, same sequence, on every machine. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, max: number) => Math.min(max, Math.max(0, Math.round(v)));
const randInt = (rnd: () => number, n: number) => Math.floor(rnd() * n);
const randSector = (rnd: () => number) => Math.floor(rnd() * 3600) / 10;

function cylinders(kind: WorkloadKind, n: number, maxCyl: number, rnd: () => number): { cylinder: number; sector: number }[] {
  switch (kind) {
    case 'uniform':
      return Array.from({ length: n }, () => ({ cylinder: randInt(rnd, maxCyl + 1), sector: randSector(rnd) }));

    case 'sequential': {
      const streams = Array.from({ length: 1 + randInt(rnd, 3) }, () => ({
        cylinder: randInt(rnd, maxCyl + 1),
        sector: randSector(rnd),
      }));
      // Requests arrive interleaved across streams, so FCFS order hops between them.
      return Array.from({ length: n }, () => {
        const s = streams[randInt(rnd, streams.length)];
        const out = { cylinder: clamp(s.cylinder, maxCyl), sector: s.sector };
        s.cylinder = s.cylinder >= maxCyl ? 0 : s.cylinder + 1;
        s.sector = (s.sector + 30) % 360;
        return out;
      });
    }

    case 'zipf': {
      const regions = 20;
      const weights = Array.from({ length: regions }, (_, r) => 1 / Math.pow(r + 1, 1.2));
      const total = weights.reduce((a, b) => a + b, 0);
      // Random placement of popularity ranks across the disk
      const order = Array.from({ length: regions }, (_, i) => i);
      for (let i = regions - 1; i > 0; i--) {
        const j = randInt(rnd, i + 1);
        [order[i], order[j]] = [order[j], order[i]];
      }
      const width = (maxCyl + 1) / regions;
      return Array.from({ length: n }, () => {
        let u = rnd() * total;
        let rank = 0;
        while (rank < regions - 1 && u > weights[rank]) {
          u -= weights[rank];
          rank++;
        }
        const start = order[rank] * width;
        return { cylinder: clamp(start + rnd() * width - 0.5, maxCyl), sector: randSector(rnd) };
      });
    }

    case 'clustered': {
      const centers = Array.from({ length: 2 + randInt(rnd, 3) }, () => randInt(rnd, maxCyl + 1));
      return Array.from({ length: n }, () => {
        const c = centers[randInt(rnd, centers.length)];
        const offset = (rnd() + rnd() - 1) * 5; // triangular, ±5 cylinders
        return { cylinder: clamp(c + offset, maxCyl), sector: randSector(rnd) };
      });
    }
  }
}

/** Generates one static-batch workload. Every value comes from rnd, so it is reproducible. */
export function generateWorkload(kind: WorkloadKind, n: number, diskSize: number, rnd: () => number): Workload {
  const maxCyl = Math.max(0, diskSize - 1);
  const headStart = randInt(rnd, maxCyl + 1);
  const requests = cylinders(kind, n, maxCyl, rnd).map((r, id) => ({ id, ...r, arrivalTime: 0 }));
  return { headStart, requests };
}
