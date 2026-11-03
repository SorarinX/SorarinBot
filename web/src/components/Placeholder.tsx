type PagePlaceholderProps = {
  title: string;
  description: string;
  note: string;
};

export function PagePlaceholder({ title, description, note }: PagePlaceholderProps) {
  return (
    <div>
      <header className="mb-6">
        <h1 className="text-[20px] font-semibold leading-7 tracking-tight text-text">
          {title}
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-6 text-muted">
          {description}
        </p>
      </header>

      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <span className="text-[13px] font-medium text-text">卡片占位</span>
          <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] leading-4 text-muted">
            待接入
          </span>
        </div>
        <div className="p-5">
          <div className="space-y-3" aria-hidden="true">
            <div className="h-3 w-2/5 rounded-full bg-surface-2" />
            <div className="h-3 w-4/5 rounded-full bg-surface-2" />
            <div className="h-3 w-3/5 rounded-full bg-surface-2" />
          </div>
          <p className="mt-5 text-[12px] leading-5 text-muted">{note}</p>
        </div>
      </section>
    </div>
  );
}
