# Disk Scheduling Visualizer

An interactive web-based simulator for understanding, visualizing, and comparing disk scheduling algorithms. The project combines traditional disk scheduling techniques with workload benchmarking, online scheduling simulation, and adversarial workload discovery.

## Overview

Disk scheduling determines the order in which disk I/O requests are serviced. Different scheduling algorithms can produce different seek distances, response times, and overall performance.

This project provides a visual environment to explore how these algorithms behave under different workloads. Users can generate request sequences, observe head movement, compare performance metrics, and investigate workloads that expose algorithmic weaknesses.

## Features

### 1. Disk Scheduling Simulation
- Visual representation of disk cylinders and head movement.
- Interactive request generation and simulation.
- Step-by-step execution with playback controls.
- Seek graph and request execution table.
- Physical seek and rotational latency modelling.

### 2. Traditional Scheduling Algorithms

The simulator supports:

| Algorithm | Description |
|---|---|
| FCFS | Services requests in their arrival order. |
| SSTF | Selects the request closest to the current head position. |
| SSTF-AGE | SSTF with an ageing mechanism to address starvation. |
| SATF | Selects requests based on access-time estimation. |
| SCAN | Moves in one direction, servicing requests before reversing. |
| C-SCAN | Services requests in one direction and returns to the beginning. |
| LOOK | Reverses direction at the last pending request. |

### 3. Performance Metrics
Compare algorithms using performance measurements such as:
- Total seek distance.
- Average seek distance.
- Total and average access time.
- Request completion behaviour.

### 4. Benchmarking System
- Evaluate algorithms using generated workloads.
- Compare performance across multiple scheduling strategies.
- Examine how workload characteristics affect algorithm performance.

### 5. Adversarial Workload Finder
- Generate workloads designed to expose weaknesses in scheduling algorithms.
- Experiment with workload parameters and random seeds.
- Compare algorithm behaviour under challenging request distributions.

### 6. Online Scheduling Simulation
Explore online scheduling strategies, including:
- FSCAN
- N-step SCAN

The online simulator also provides fairness and response-related performance measurements.

## Technologies Used

| Technology | Purpose |
|---|---|
| React | User interface development |
| TypeScript | Type-safe application logic |
| Vite | Development server and build tool |
| Tailwind CSS | Interface styling |
| Lucide React | Icons |
| Vitest | Testing |

## Getting Started

### Prerequisites

Install the following before running the project:

- [Node.js](https://nodejs.org/) (includes npm)
- Git (optional, for cloning the repository)

### Installation

**1. Clone the repository**

```bash
git clone https://github.com/vyshnavi1805/Disk-Scheduling-Visualizer.git
```

**2. Navigate to the project directory**

```bash
cd Disk-Scheduling-Visualizer
```

**3. Install dependencies**

```bash
npm install
```

**4. Start the development server**

```bash
npm run dev
```

Open the local URL displayed in the terminal, usually:

```text
http://localhost:5173
```

## Available Commands

| Command | Description |
|---|---|
| `npm run dev` | Starts the development server. |
| `npm run build` | Creates a production build. |
| `npm run preview` | Previews the production build. |
| `npm run lint` | Runs ESLint checks. |
| `npm run typecheck` | Checks TypeScript types. |
| `npm run test` | Runs the test suite. |

## Project Structure

```text
Disk-Scheduling-Visualizer/
│
├── src/
│   ├── components/
│   │   ├── AdversarialPanel.tsx
│   │   ├── BenchmarkPanel.tsx
│   │   ├── ComparisonTable.tsx
│   │   ├── ControlPanel.tsx
│   │   ├── CylinderTrack.tsx
│   │   ├── DiskPlatter.tsx
│   │   ├── Header.tsx
│   │   ├── MetricsPanel.tsx
│   │   ├── OnlineCharts.tsx
│   │   ├── OnlinePanel.tsx
│   │   ├── PlaybackControls.tsx
│   │   ├── SeekGraph.tsx
│   │   └── StepTable.tsx
│   │
│   ├── lib/
│   │   ├── algorithms.ts
│   │   ├── adversarial.ts
│   │   ├── benchmark.ts
│   │   ├── online.ts
│   │   ├── playback.ts
│   │   ├── workloads.ts
│   │   └── __tests__/
│   │
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css
│   └── types.ts
│
├── index.html
├── package.json
├── package-lock.json
├── vite.config.ts
├── tsconfig.json
└── README.md
```

## Learning Objectives

This project demonstrates:

- Understanding disk scheduling and I/O request management.
- Comparing the behaviour of different scheduling algorithms.
- Analysing seek distance and access-time performance.
- Understanding starvation and fairness in scheduling.
- Studying online scheduling under dynamically arriving workloads.
- Evaluating algorithm performance through benchmarking and adversarial testing.

## Future Improvements

Potential extensions include:
- Additional disk scheduling algorithms.
- More workload-generation strategies.
- Expanded performance and fairness metrics.
- Exportable benchmark reports.
- Support for more complex disk access models.

## Contributing

Contributions, suggestions, and improvements are welcome. Fork the repository, create a feature branch, and submit a pull request.

## License

A license has not yet been specified for this repository. Add a license before distributing or reusing the project under specific open-source terms.
