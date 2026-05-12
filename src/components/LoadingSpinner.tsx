export function LoadingSpinner({ size = 56 }: { size?: number }) {
  return (
    <div
      className="rounded-full"
      style={{
        width: size,
        height: size,
        animation: "spin 1.1s linear infinite",
        backgroundImage: `url(/app-icon.png)`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        display: "inline-block",
        boxShadow: "0 0 0 3px var(--brand, #6d28d9)",
      }}
    />
  );
}

export function FullPageLoader() {
  return (
    <div dir="rtl" className="min-h-screen flex flex-col items-center justify-center gap-4">
      <LoadingSpinner size={64} />
      <p className="text-muted-foreground text-sm font-semibold animate-pulse">جاري التحميل...</p>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
