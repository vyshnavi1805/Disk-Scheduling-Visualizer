import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Algorithm, PlaybackState, VisualizerInput } from '@/types';
import { ALGORITHM_INFO, makeRequests, runAlgorithm } from '@/lib/algorithms';
import { downloadProjectZip } from '@/lib/download';
import { Header } from '@/components/Header';
import { ControlPanel } from '@/components/ControlPanel';
import { PlaybackControls } from '@/components/PlaybackControls';
import { MetricsPanel } from '@/components/MetricsPanel';
import { CylinderTrack } from '@/components/CylinderTrack';
import { DiskPlatter } from '@/components/DiskPlatter';
import { SeekGraph } from '@/components/SeekGraph';
import { StepTable } from '@/components/StepTable';
import { ComparisonTable } from '@/components/ComparisonTable';
import { BenchmarkPanel } from '@/components/BenchmarkPanel';
import { AdversarialPanel } from '@/components/AdversarialPanel';
import { OnlinePanel } from '@/components/OnlinePanel';
import type { Workload } from '@/lib/workloads';

const DEFAULT_INPUT: VisualizerInput = {
  requests: makeRequests([98, 183, 37, 122, 14, 124, 65, 67]).map((r, i) => ({
    ...r,
    sector: [72, 180, 45, 290, 110, 215, 330, 15][i],
  })),
  headStart: 53,
  diskSize: 200, // Cylinders 0 - 199
  direction: 'right',
  rpm: 7200,
  seekRate: 0.1, // full stroke = 199 * 0.1 = 19.9 ms, a typical HDD figure
  seekModel: 'curve',
  seekA: 1.0,
  countReturnJump: true,
  agingAlpha: 0.5,
};

export default function App() {
  const [input, setInput] = useState<VisualizerInput>(DEFAULT_INPUT);
  const [algorithm, setAlgorithm] = useState<Algorithm>('C-SCAN');
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [animationSpeed, setAnimationSpeed] = useState(1);
  const [downloading, setDownloading] = useState(false);

  const animFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  // What the simulation actually sees: requests beyond the disk are ignored and the head is
  // clamped, without deleting anything from what the user typed.
  const simInput = useMemo<VisualizerInput>(() => {
    const maxCyl = Math.max(0, input.diskSize - 1);
    return {
      ...input,
      headStart: Math.min(Math.max(0, input.headStart), maxCyl),
      requests: input.requests.filter(r => r.cylinder >= 0 && r.cylinder <= maxCyl),
    };
  }, [input]);

  const result = useMemo(() => runAlgorithm(algorithm, simInput), [algorithm, simInput]);
  const totalSteps = result.steps.length;

  useEffect(() => {
    setCurrentStep(0);
    setProgress(0);
    setPlaybackState('idle');
  }, [algorithm, simInput]);

  useEffect(() => {
    if (playbackState !== 'playing') {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

    const stepDurationMs = 1000 / animationSpeed;

    const tick = (time: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = time;
      const delta = time - lastTimeRef.current;
      lastTimeRef.current = time;

      setProgress(prev => {
        const next = prev + delta / stepDurationMs;
        if (next >= 1) {
          setCurrentStep(step => {
            if (step + 1 >= totalSteps) {
              setPlaybackState('idle');
              return totalSteps;
            }
            return step + 1;
          });
          return 0;
        }
        return next;
      });

      animFrameRef.current = requestAnimationFrame(tick);
    };

    lastTimeRef.current = 0;
    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [playbackState, animationSpeed, totalSteps]);

  const handlePlay = useCallback(() => {
    if (currentStep >= totalSteps) {
      setCurrentStep(0);
      setProgress(0);
    }
    setPlaybackState('playing');
  }, [currentStep, totalSteps]);

  const handlePause = useCallback(() => setPlaybackState('paused'), []);
  const handleStep = useCallback(() => {
    setPlaybackState('paused');
    setProgress(0);
    setCurrentStep(step => Math.min(step + 1, totalSteps));
  }, [totalSteps]);
  const handleReset = useCallback(() => {
    setPlaybackState('idle');
    setCurrentStep(0);
    setProgress(0);
    setInput(DEFAULT_INPUT);
  }, []);
  const handleShuffle = useCallback(() => {
    const count = 8 + Math.floor(Math.random() * 5);
    const maxCyl = Math.max(1, input.diskSize - 1);
    // UI-only randomness: the generated workload is then fixed and shared by every algorithm.
    const reqs = Array.from({ length: count }, (_, id) => ({
      id,
      cylinder: Math.floor(Math.random() * maxCyl),
      sector: Math.round(Math.random() * 3600) / 10,
      arrivalTime: 0,
    }));
    const newHead = Math.floor(Math.random() * maxCyl);
    setInput(prev => ({
      ...prev,
      requests: reqs,
      headStart: newHead,
    }));
  }, [input.diskSize]);

  const handleLoadWorkload = useCallback((w: Workload) => {
    setInput(prev => ({ ...prev, headStart: w.headStart, requests: w.requests }));
  }, []);

  const handleLoadAdversarial = useCallback((w: Workload, algo: Algorithm) => {
    setInput(prev => ({ ...prev, headStart: w.headStart, requests: w.requests }));
    setAlgorithm(algo);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      await downloadProjectZip();
    } catch (e) {
      console.error('Download failed:', e);
    } finally {
      setDownloading(false);
    }
  }, []);

  return (
    <div className="min-h-screen relative" style={{ background: 'var(--bg-void)' }}>
      {/* Background effects */}
      <div className="bg-orb-1" />
      <div className="bg-orb-2" />
      <div className="fixed inset-0 grid-overlay" />

      <div className="relative z-10">
        <Header onDownload={handleDownload} downloading={downloading} />

        <div className="max-w-[1600px] mx-auto px-5 lg:px-10 py-6 lg:py-8">
          {/* Metrics */}
          <div className="mb-6">
            <MetricsPanel result={result} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5">
            {/* Left: Controls */}
            <div className="space-y-4">
              <ControlPanel
                input={input}
                onChange={setInput}
                algorithm={algorithm}
                onAlgorithmChange={setAlgorithm}
                onShuffle={handleShuffle}
                onReset={handleReset}
              />
            </div>

            {/* Right: Visualizations */}
            <div className="space-y-4">
              {/* Top row: Cylinder Track + Disk Platter */}
              <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-4">
                <CylinderTrack
                  result={result}
                  input={simInput}
                  currentStep={currentStep}
                  progress={progress}
                />
                <DiskPlatter
                  result={result}
                  input={simInput}
                  currentStep={currentStep}
                  progress={progress}
                />
              </div>

              {/* Seek Graph */}
              <SeekGraph
                result={result}
                input={simInput}
                currentStep={currentStep}
                progress={progress}
              />

              {/* Step Table */}
              <StepTable result={result} currentStep={currentStep} />

              {/* Playback Controls */}
              <PlaybackControls
                state={playbackState}
                onPlay={handlePlay}
                onPause={handlePause}
                onStep={handleStep}
                onReset={handleReset}
                animationSpeed={animationSpeed}
                onSpeedChange={setAnimationSpeed}
                currentStep={currentStep}
                totalSteps={totalSteps}
              />

              <ComparisonTable input={simInput} algorithm={algorithm} onSelect={setAlgorithm} />
            </div>
          </div>

          <div className="mt-5">
            <BenchmarkPanel input={simInput} onLoadWorkload={handleLoadWorkload} />
          </div>

          <div className="mt-5">
            <AdversarialPanel input={simInput} onLoad={handleLoadAdversarial} />
          </div>

          <div className="mt-5">
            <OnlinePanel input={simInput} />
          </div>

          {/* Footer */}
          <footer className="mt-12 pt-6 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-3">
            <p className="text-[11px] text-[var(--text-muted)]">
              Disk Scheduling Algorithm Visualizer — Interactive Educational Tool
            </p>
            <p className="text-[11px] text-[var(--text-muted)] font-mono tracking-wider">
              {ALGORITHM_INFO[algorithm].fullName}
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}
