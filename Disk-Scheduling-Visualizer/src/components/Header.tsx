import { HardDrive, Download } from 'lucide-react';

interface Props {
  onDownload: () => void;
  downloading: boolean;
}

export function Header({ onDownload, downloading }: Props) {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border-subtle)] backdrop-blur-2xl" style={{ background: 'rgba(5,8,16,0.7)' }}>
      <div className="max-w-[1600px] mx-auto px-5 lg:px-10 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 rounded-xl blur-lg opacity-60" style={{ background: 'linear-gradient(135deg, #06b6d4, #3b82f6)' }} />
            <div className="relative w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #06b6d4, #3b82f6)' }}>
              <HardDrive size={20} className="text-white" strokeWidth={2.5} />
            </div>
          </div>
          <div>
            <h1 className="text-base font-bold gradient-text leading-none tracking-tight">Disk Scheduling Visualizer</h1>
            <p className="text-[10px] text-[var(--text-muted)] mt-1 font-mono tracking-wider">FCFS · SSTF · SSTF-AGE · SATF · SCAN · C-SCAN · LOOK</p>
          </div>
        </div>

        <button
          onClick={onDownload}
          disabled={downloading}
          className="btn-glow relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
          style={{
            background: 'linear-gradient(135deg, rgba(6,182,212,0.12), rgba(59,130,246,0.12))',
            border: '1px solid rgba(6,182,212,0.25)',
            color: 'var(--accent-bright)',
          }}
        >
          <Download size={16} />
          {downloading ? 'Packaging...' : 'Download ZIP'}
        </button>
      </div>
    </header>
  );
}
