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
