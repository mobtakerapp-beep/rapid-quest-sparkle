import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

export function LiveClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const locale = navigator.language || "ar-OM";
  const timeStr = time.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const city = timezone.split("/").pop()?.replace(/_/g, " ") ?? timezone;

  return (
    <div className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground select-none" dir="ltr">
      <Clock className="h-3.5 w-3.5 shrink-0" />
      <span className="tabular-nums">{timeStr}</span>
      <span className="hidden sm:inline text-[10px] opacity-60">({city})</span>
    </div>
  );
}
