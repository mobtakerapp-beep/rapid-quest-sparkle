import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Props = {
  value: string; // datetime-local string "YYYY-MM-DDTHH:mm" or ""
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
};

function pad(n: number) { return n.toString().padStart(2, "0"); }
function toLocal(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function DateTimePicker({ value, onChange, placeholder = "اختر التاريخ والوقت", className }: Props) {
  const date = value ? new Date(value) : undefined;
  const time = date ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : "12:00";

  const handleDate = (d: Date | undefined) => {
    if (!d) return;
    const [h, m] = time.split(":").map(Number);
    d.setHours(h || 0, m || 0, 0, 0);
    onChange(toLocal(d));
  };
  const handleTime = (t: string) => {
    const d = date ?? new Date();
    const [h, m] = t.split(":").map(Number);
    d.setHours(h || 0, m || 0, 0, 0);
    onChange(toLocal(d));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("w-full justify-start text-right font-normal", !date && "text-muted-foreground", className)}
        >
          <CalendarIcon className="ms-1 h-4 w-4" />
          {date ? format(date, "yyyy/MM/dd HH:mm") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={date} onSelect={handleDate} initialFocus className={cn("p-3 pointer-events-auto")} />
        <div className="p-3 border-t flex items-center gap-2">
          <span className="text-sm text-muted-foreground">الوقت</span>
          <input
            type="time"
            value={time}
            onChange={(e) => handleTime(e.target.value)}
            className="flex-1 px-3 py-1.5 rounded-md border border-border bg-background"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
