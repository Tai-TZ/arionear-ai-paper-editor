import { Download } from "lucide-react";
import type { ProjectAsset } from "@/lib/project-store";
import { useLocale } from "@/components/locale-context";
import { editorCopy } from "@/lib/editor-i18n";

type ProjectAssetPreviewProps = {
  path: string;
  asset: ProjectAsset;
};

function isPdfAsset(path: string, mimeType: string) {
  return mimeType === "application/pdf" || path.toLowerCase().endsWith(".pdf");
}

export function ProjectAssetPreview({ path, asset }: ProjectAssetPreviewProps) {
  const { locale } = useLocale();
  const t = editorCopy(locale);
  const fileName = path.split("/").pop() ?? path;
  const pdf = isPdfAsset(path, asset.mimeType);

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = asset.dataUrl;
    link.download = fileName;
    link.rel = "noopener";
    link.click();
  };

  return (
    <div className="project-asset-preview">
      <div className="project-asset-preview-toolbar">
        <button type="button" className="project-asset-preview-download" onClick={handleDownload}>
          <Download className="h-3.5 w-3.5" strokeWidth={2} />
          {t.assetPreview.download}
        </button>
      </div>
      <div className="project-asset-preview-body soft-scrollbar">
        {pdf ? (
          <iframe className="project-asset-preview-pdf" src={asset.dataUrl} title={path} />
        ) : (
          <img
            className="project-asset-preview-image"
            src={asset.dataUrl}
            alt={path}
            draggable={false}
          />
        )}
      </div>
    </div>
  );
}
