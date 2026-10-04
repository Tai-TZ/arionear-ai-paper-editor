import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { FolderOpen, Pencil } from "lucide-react";

export type EditableProjectNameHandle = {
  startEditing: () => void;
};

type EditableProjectNameProps = {
  name: string;
  onRename: (name: string) => void | Promise<void>;
  className?: string;
  showFolderIcon?: boolean;
  showEditButton?: boolean;
  variant?: "default" | "list";
  disabled?: boolean;
  onEditingChange?: (editing: boolean) => void;
};

export const EditableProjectName = forwardRef<EditableProjectNameHandle, EditableProjectNameProps>(
  function EditableProjectName(
    {
      name,
      onRename,
      className = "",
      showFolderIcon = true,
      showEditButton = true,
      variant = "default",
      disabled = false,
      onEditingChange,
    },
    ref,
  ) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(name);
    const [saving, setSaving] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
      if (!editing) setDraft(name);
    }, [name, editing]);

    useEffect(() => {
      onEditingChange?.(editing);
    }, [editing, onEditingChange]);

    useEffect(() => {
      if (!editing) return;
      const frame = requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
      return () => cancelAnimationFrame(frame);
    }, [editing]);

    useImperativeHandle(ref, () => ({
      startEditing: () => {
        if (!disabled) setEditing(true);
      },
    }));

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

    const beginEditing = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!disabled) setEditing(true);
    };

    const inputClass =
      variant === "list"
        ? "projects-row-name-input min-w-0 w-full"
        : "min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none ring-primary/30 focus:ring-2";

    if (editing) {
      return (
        <input
          ref={inputRef}
          value={draft}
          disabled={disabled || saving}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            // IME composition (Vietnamese, CJK…): Enter picks the candidate, it must not submit.
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === "Enter") {
              e.preventDefault();
              void commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          className={`${inputClass} ${className}`}
          aria-label="Project name"
        />
      );
    }

    const nameClass =
      variant === "list"
        ? "projects-row-name block truncate"
        : "min-w-0 flex-1 truncate text-sm font-medium";

    return (
      <div
        className={`flex min-w-0 flex-1 items-center gap-2 ${className}`}
        onDoubleClick={beginEditing}
      >
        {showFolderIcon && <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <span className={nameClass} title={name}>
          {name}
        </span>
        {showEditButton && (
          <button
            type="button"
            disabled={disabled}
            onClick={beginEditing}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
            aria-label="Rename project"
            title="Rename project"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  },
);
