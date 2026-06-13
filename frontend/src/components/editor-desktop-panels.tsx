import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

function useClientMounted() {
  const [mounted, setMounted] = useState(false);
  useLayoutEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}

type EditorDesktopPanelsProps = {
  center: ReactNode;
  right: ReactNode;
};

function PanelFallback({ center, right }: EditorDesktopPanelsProps) {
  return (
    <div className="editor-panel-fallback flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <div className="editor-panel-fallback-center flex min-h-0 min-w-0 flex-col overflow-hidden">
        {center}
      </div>
      <div className="editor-resize-handle w-px shrink-0" aria-hidden />
      <div className="editor-panel-fallback-preview flex min-h-0 min-w-0 flex-col overflow-hidden">
        {right}
      </div>
    </div>
  );
}

export function EditorDesktopPanels({ center, right }: EditorDesktopPanelsProps) {
  const mounted = useClientMounted();

  useEffect(() => {
    if (!mounted) return;
    const frame = requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
    return () => cancelAnimationFrame(frame);
  }, [mounted]);

  if (!mounted) {
    return <PanelFallback center={center} right={right} />;
  }

  return (
    <ResizablePanelGroup
      id="editor-main"
      orientation="horizontal"
      className="min-w-0 flex-1"
      defaultLayout={{ center: 58, preview: 42 }}
    >
      <ResizablePanel
        id="center"
        defaultSize={58}
        minSize={28}
        className="flex min-h-0 min-w-0 flex-col"
      >
        {center}
      </ResizablePanel>
      <ResizableHandle className="editor-resize-handle" />
      <ResizablePanel
        id="preview"
        defaultSize={42}
        minSize={22}
        className="flex min-h-0 min-w-0 flex-col"
      >
        {right}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
