export function LoadingSpinner({ size = 56 }: { size?: number }) {
  return (
    <>
      <div
        className="rounded-full overflow-hidden"
        style={{
          width: size,
          height: size,
          animation: "spin-bounce 1.2s ease-in-out infinite",
          boxShadow: "0 0 0 3px var(--brand, #6d28d9), 0 4px 20px rgba(109,40,217,0.3)",
          flexShrink: 0,
        }}
      >
        <img src="/app-icon.png" alt="مبادرة كلنا معاً" className="w-full h-full object-cover" />
      </div>
      <style>{`
        @keyframes spin-bounce {
          0%   { transform: rotate(0deg) scale(1); }
          50%  { transform: rotate(180deg) scale(1.08); }
          100% { transform: rotate(360deg) scale(1); }
        }
      `}</style>
    </>
  );
}

export function FullPageLoader() {
  return (
    <div dir="rtl" className="min-h-screen flex flex-col items-center justify-center gap-5 bg-background">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-[var(--brand)]/20 blur-2xl scale-150" />
        <LoadingSpinner size={80} />
      </div>
      <p className="text-muted-foreground text-sm font-bold animate-pulse">جاري التحميل...</p>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function CardSkeleton() {
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <Skeleton className="h-44 w-full rounded-none" />
      <div className="p-4 space-y-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <div className="flex gap-2 mt-3">
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-7 w-16" />
        </div>
      </div>
    </div>
  );
}

export function ListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-card rounded-2xl border border-border p-4 flex gap-3 items-center">
          <Skeleton className="h-12 w-12 rounded-xl flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-8 w-16 rounded-lg flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-card rounded-2xl border border-border p-5 space-y-3">
          <Skeleton className="h-12 w-12 rounded-xl" />
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}
