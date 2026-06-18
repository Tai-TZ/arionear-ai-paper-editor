import { useEffect, useRef, useState } from "react";
import { FolderOpen, Pencil } from "lucide-react";

type EditableProjectNameProps = {
  name: string;
  onRename: (name: string) => void | Promise<void>;
  className?: string;
  showFolderIcon?: boolean;
};

export function EditableProjectName({
  name,
  onRename,
  className = "",
  showFolderIcon = true,
}: EditableProjectNameProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(name);
  }, [name, editing]);

  useEffect(() => {
    if (!editing) return;
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [editing]);

  const cancel = () => {
    setDraft(name);
    setEditing(false);
  };

  const commit = async () => {
    const trimmed = draft.trim();
    setEditing(false);
    if (!trimmed || trimmed === name) {
      setDraft(name);
      return;
    }
    setSaving(true);
    try {
      await onRename(trimmed);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        className={`min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none ring-primary/30 focus:ring-2 ${className}`}
        aria-label="Project name"
      />
    );
  }

  return (
    <div className={`flex min-w-0 flex-1 items-center gap-2 ${className}`}>
      {showFolderIcon && <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />}
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
        aria-label="Rename project"
        title="Rename project"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
