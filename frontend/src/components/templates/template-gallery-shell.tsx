import { Link } from "@tanstack/react-router";

export function TemplateOfficialBadge({ label }: { label: string }) {
  return <span className="template-official-badge">{label}</span>;
}

export function TemplateTagList({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <div className="template-tag-list">
      {tags.map((tag) => (
        <span key={tag} className="template-tag">
          {tag}
        </span>
      ))}
    </div>
  );
}

export function TemplateBackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="template-back-link">
      ← {label}
    </Link>
  );
}
