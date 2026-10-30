# Disk Scheduling Visualizer

Interactive React + TypeScript visualizer for FCFS, SSTF, SSTF with aging, SATF, SCAN, C-SCAN, and LOOK disk scheduling algorithms.

## Run locally

Requirements: Node.js LTS.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (usually http://localhost:5173).

## Other commands

```bash
npm test
npm run build
npm run typecheck
npm run lint
```

## Model assumptions

What the simulator models, and what it simplifies on purpose.

- **Cylinders** run from `0` to `diskSize - 1`. Requests outside that range are rejected, not clamped.
- **Requests** are `{ id, cylinder, sector, arrivalTime }`. The sector belongs to the request, so every
  algorithm is compared on the same physical workload. All requests are a static batch (`arrivalTime = 0`).
- **Seek time.** Linear: `t = d * seekRate`. Curve: `t = a + b * sqrt(d)`. Both give `t(0) = 0`.
  `b` is not a free parameter. It is calibrated so a full stroke takes the same time in both models:

  ```
  a + b * sqrt(maxCyl) = maxCyl * seekRate   =>   b = (maxCyl * seekRate - a) / sqrt(maxCyl)
  ```

  Without this, switching models would only rescale every result. With it, the two models differ only in
  shape: short hops cost more under the curve. If `a` exceeds the full-stroke time, `b` is clamped to 0.
  The default `seekRate` of 0.1 ms/cyl gives a 19.9 ms full stroke on a 200-cylinder disk.
- **Rotation.** The platter spins continuously at the set RPM, including during seeks. Rotational latency is
  the time from the head's arrival until the request's sector comes round. It is not random.
- **Boundary stops** (SCAN turnaround, C-SCAN ends and return jump) cost seek distance and time but are not
  requests: they have no rotational latency and are excluded from per-request averages.
- **C-SCAN return jump** is counted by default. When the toggle is off, the jump is treated as free (no
  distance, no time).
- **SATF** greedily picks the request with the smallest seek + rotational wait. Greedy is not optimal: on
  some workloads it loses to SSTF.
- **SSTF with aging** uses `priority = distance - alpha * wait`. In a static batch all requests have waited
  equally long, so it behaves exactly like SSTF. It only differs once requests arrive over time.
- **Not modelled:** transfer time, head switch time, caching, command queuing in the drive, and zoned
  recording (all tracks have the same angular layout).

Project layout follows the standard Vite structure: `package.json`, `vite.config.ts`, and `index.html` at the project root, with React source files under `src/`.

## Benchmark

The benchmark panel runs every algorithm on the same 200 generated workloads and reports the mean with a
95% confidence interval (normal approximation, `1.96 * sd / sqrt(n)`). Each run has its own seed
(`seed * 100003 + run`), so any run can be loaded into the visualizer and replayed exactly.

Workload types (`src/lib/workloads.ts`):

- **Uniform:** cylinders and sectors uniformly random.
- **Sequential:** 1–3 interleaved streams of consecutive cylinders, each block 30° further round the platter.
- **Zipf hot spots:** 20 regions with Zipf (s = 1.2) popularity.
- **Clustered:** 2–4 clusters of ±5 cylinders.

With the default settings (curve seek, 0.1 ms/cyl, 7200 RPM, 20 requests), SSTF has the lowest mean seek
distance on every workload type, but SATF has the lowest mean access time, with non-overlapping confidence
intervals. A test (`benchmark.test.ts`) checks this, so a change that breaks it fails the build.

## Adversarial workload finder

Pick algorithms A and B and a cost (access time or seek distance). The finder searches for a request queue
that maximizes `cost(A) / cost(B)` (`src/lib/adversarial.ts`): 4 random-restart hill climbs, about 4000
workloads in total, each climb starting from the best of 25 generated workloads. Mutations move a request's
cylinder or sector, move the head, swap queue positions, or copy a cylinder (to build clusters). It finds a
bad case, not a proven worst case. A reference cost of 0 scores 0, so it never divides by zero.

Things it rediscovers or finds (default settings, 8–20 requests):

- FCFS vs SSTF (distance): about n times worse, via requests ping-ponging between two cylinders.
- SSTF vs SATF (time): over 10 times worse when all requests sit on one cylinder. SSTF sees zero seek
  everywhere, ignores rotation, and waits most of a revolution per request.
- SATF vs SSTF and SATF vs FCFS (time): greedy SATF can lose to both.

## Online mode: requests arriving over time

`src/lib/online.ts` is an event-driven simulator. Requests arrive over time (Poisson, or bursts of 5–15
requests 0.2 ms apart with the same long-run rate). Each scheduler can only choose among requests that have
already arrived, and service is non-preemptive. When nothing is waiting, the disk idles until the next arrival.

Extra algorithms here: **FSCAN** (freeze the queue, serve it as one LOOK sweep; new arrivals wait for the
next sweep) and **N-step SCAN** (serve the oldest N waiting requests as one LOOK sweep). SCAN and C-SCAN
travel to the disk edge when nothing is ahead; LOOK reverses at once.

Metrics per run: mean, p50, p95, p99 and max response time (queueing + seek + rotation), throughput, Jain's
fairness index over response times, and starved requests (response above 3× that algorithm's own mean). The
panel shows the mean of each metric over 20 seeded runs of 300 requests, with a 95% CI on hover.

With the default disk on a busy load (Poisson, mean gap 16 ms): SATF has the lowest mean and p95 but not the
lowest worst case; FSCAN and LOOK cut SSTF's worst case by about 20%; SSTF with aging (α = 0.5) lowers SSTF's
p99 and max for a few percent more mean. Tests in `online.test.ts` check each of these.
