interface ProjectWorkspacePlaceholderPageProps {
  title: string;
  summary: string;
}

export function ProjectWorkspacePlaceholderPage({
  title,
  summary,
}: ProjectWorkspacePlaceholderPageProps) {
  return (
    <section className="surface-panel surface-panel--workspace">
      <div className="space-y-3">
        <p className="page-kicker">PROJECT WORKSPACE</p>
        <h2 className="page-title">{title}</h2>
        <p className="page-summary">{summary}</p>
      </div>
    </section>
  );
}
