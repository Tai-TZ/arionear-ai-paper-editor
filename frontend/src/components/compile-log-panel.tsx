import { X } from "lucide-react";

type CompileLogPanelProps = {
  log: string;
  open: boolean;
  onClose: () => void;
};

export function CompileLogPanel({ log, open, onClose }: CompileLogPanelProps) {
  if (!open) return null;

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 flex max-h-[45%] flex-col border-t border-[#D3D3D3] bg-[#1e1e1e] shadow-lg">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/10 px-3">
        <span className="font-mono text-[11px] font-medium text-white/80">Full compile log</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-white/60 transition hover:bg-white/10 hover:text-white"
          aria-label="Close log"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <pre className="soft-scrollbar flex-1 overflow-auto p-3 font-mono text-[10px] leading-relaxed text-[#d4d4d4] whitespace-pre-wrap">
        {log || "No log output."}
      </pre>
    </div>
  );
}
