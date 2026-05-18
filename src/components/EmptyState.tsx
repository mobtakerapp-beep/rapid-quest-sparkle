interface EmptyStateProps {
  emoji?: string;
  title: string;
  desc?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ emoji = "📭", title, desc, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center gap-5">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-[var(--brand)]/10 blur-2xl scale-150 pointer-events-none" />
        <div className="relative h-28 w-28 rounded-3xl bg-secondary flex items-center justify-center text-5xl shadow-inner select-none">
          {emoji}
        </div>
      </div>
      <div className="space-y-1.5 max-w-xs">
        <h3 className="text-base font-bold text-foreground">{title}</h3>
        {desc && <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>}
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className="px-5 py-2.5 rounded-xl bg-[image:var(--gradient-hero)] text-white text-sm font-bold hover:scale-105 transition-transform shadow-[var(--shadow-soft)]"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
