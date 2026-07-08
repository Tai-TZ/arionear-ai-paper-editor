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
  groupId?: string;
  centerPanelId?: string;
  previewPanelId?: string;
  centerDefaultSize?: number;
  previewDefaultSize?: number;
  centerMinSize?: number;
  previewMinSize?: number;
  centerMaxSize?: number;
  previewMaxSize?: number;
};

function PanelFallback({ center }: { center: ReactNode }) {
  return (
    <div className="editor-panel-fallback flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <div className="editor-panel-fallback-center flex min-h-0 min-w-0 flex-col overflow-hidden">
        {center}
      </div>
      <div className="editor-resize-handle w-px shrink-0" aria-hidden />
      <div className="editor-panel-fallback-preview flex min-h-0 min-w-0 flex-col overflow-hidden bg-muted/20" />
    </div>
  );
}

export function EditorDesktopPanels({
  center,
  right,
  groupId = "editor-main",
  centerPanelId = "center",
  previewPanelId = "preview",
  centerDefaultSize = 58,
  previewDefaultSize = 42,
  centerMinSize = 200,
  previewMinSize = 200,
  centerMaxSize,
  previewMaxSize,
}: EditorDesktopPanelsProps) {
  const mounted = useClientMounted();

  useEffect(() => {
    if (!mounted) return;
    const frame = requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
    return () => cancelAnimationFrame(frame);
  }, [mounted]);

  if (!mounted) {
    return <PanelFallback center={center} />;
  }

  return (
    <ResizablePanelGroup
      id={groupId}
      orientation="horizontal"
      className="min-h-0 min-w-0 flex-1"
      defaultLayout={{
        [centerPanelId]: centerDefaultSize,
        [previewPanelId]: previewDefaultSize,
      }}
    >
      <ResizablePanel
        id={centerPanelId}
        defaultSize={centerDefaultSize}
        minSize={centerMinSize}
        maxSize={centerMaxSize}
        className="flex min-h-0 min-w-0 flex-col"
      >
        {center}
      </ResizablePanel>
      <ResizableHandle className="editor-resize-handle" />
      <ResizablePanel
        id={previewPanelId}
        defaultSize={previewDefaultSize}
        minSize={previewMinSize}
        maxSize={previewMaxSize}
        className="flex min-h-0 min-w-0 flex-col"
      >
        {right}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
