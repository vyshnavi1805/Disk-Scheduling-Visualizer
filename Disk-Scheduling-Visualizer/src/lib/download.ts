import JSZip from 'jszip';

export async function downloadProjectZip(): Promise<void> {
  const zip = new JSZip();

  // Fetch the standalone HTML file (works by double-clicking, no install needed)
  const standaloneRes = await fetch('/standalone.html');
  const standaloneHtml = await standaloneRes.text();
  zip.file('disk-scheduling-visualizer.html', standaloneHtml);

  // Also include the full Vite source project for developers
  const sourceFiles: { path: string; url: string }[] = [
    { path: 'src/index.html', url: '/index.html' },
    { path: 'src/package.json', url: '/package.json' },
    { path: 'src/vite.config.ts', url: '/vite.config.ts' },
    { path: 'src/tsconfig.json', url: '/tsconfig.json' },
    { path: 'src/tsconfig.app.json', url: '/tsconfig.app.json' },
    { path: 'src/tsconfig.node.json', url: '/tsconfig.node.json' },
    { path: 'src/tailwind.config.js', url: '/tailwind.config.js' },
    { path: 'src/postcss.config.js', url: '/postcss.config.js' },
    { path: 'src/eslint.config.js', url: '/eslint.config.js' },
    { path: 'src/src/main.tsx', url: '/src/main.tsx' },
    { path: 'src/src/App.tsx', url: '/src/App.tsx' },
    { path: 'src/src/index.css', url: '/src/index.css' },
    { path: 'src/src/vite-env.d.ts', url: '/src/vite-env.d.ts' },
    { path: 'src/src/types.ts', url: '/src/types.ts' },
    { path: 'src/src/lib/algorithms.ts', url: '/src/lib/algorithms.ts' },
    { path: 'src/src/lib/download.ts', url: '/src/lib/download.ts' },
    { path: 'src/src/components/CylinderTrack.tsx', url: '/src/components/CylinderTrack.tsx' },
    { path: 'src/src/components/DiskPlatter.tsx', url: '/src/components/DiskPlatter.tsx' },
    { path: 'src/src/components/SeekGraph.tsx', url: '/src/components/SeekGraph.tsx' },
    { path: 'src/src/components/StepTable.tsx', url: '/src/components/StepTable.tsx' },
    { path: 'src/src/components/ControlPanel.tsx', url: '/src/components/ControlPanel.tsx' },
    { path: 'src/src/components/PlaybackControls.tsx', url: '/src/components/PlaybackControls.tsx' },
    { path: 'src/src/components/MetricsPanel.tsx', url: '/src/components/MetricsPanel.tsx' },
    { path: 'src/src/components/Header.tsx', url: '/src/components/Header.tsx' },
  ];

  const results = await Promise.allSettled(
    sourceFiles.map(f => fetch(f.url).then(res => ({ path: f.path, ok: res.ok, text: res.text() })))
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { path, ok, text } = result.value;
      if (ok) {
        zip.file(path, await text);
      }
    }
  }

  zip.file('README.md', `# Disk Scheduling Visualizer

## Quick Start (No Installation Required)

1. Extract the ZIP file
2. Double-click **disk-scheduling-visualizer.html** to open it in any web browser
3. That's it! The visualizer runs entirely in your browser

## Features

- 7 scheduling algorithms: FCFS, SSTF, SSTF with aging, SATF, SCAN, C-SCAN, LOOK
- Animated cylinder track with glowing read/write head
- Spinning disk platter with moving arm
- Step-by-step seek graph
- Detailed step table with seek distances and rotational latency
- Comprehensive metrics (total seek, seek time, avg seek, rotational latency, total access time)
- Playback controls: Play, Pause, Step, Reset, Shuffle, Speed control

## For Developers (Optional)

The \`src/\` folder contains the full Vite + React + TypeScript source project.

\`\`\`bash
cd src
npm install
npm run dev    # start dev server
npm run build  # build for production
\`\`\`
`);

  zip.file('.gitignore', `node_modules
dist
.env
.env.local
*.log
`);

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'disk-scheduling-visualizer.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
