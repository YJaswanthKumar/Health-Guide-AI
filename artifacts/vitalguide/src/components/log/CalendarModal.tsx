import { useState, useEffect } from "react";
import { useAuth } from "@clerk/react";
import { ChevronLeft, ChevronRight, CalendarDays, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type LogDate = { logDate: string; isCompleted: boolean | null };
type PlanLite = { id: number; title: string; type: string; startDate?: string | null; endDate?: string | null; status: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectDate: (date: string) => void;
  selectedDate?: string;
  refreshTrigger?: number;
  plans?: PlanLite[];
};

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function CalendarModal({ open, onOpenChange, onSelectDate, selectedDate, refreshTrigger, plans }: Props) {
  const { getToken } = useAuth();
  const today = new Date().toISOString().split("T")[0];
  const [viewDate, setViewDate] = useState(new Date());
  const [logDates, setLogDates] = useState<LogDate[]>([]);

  const fetchDates = async () => {
    try {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch("/api/logs/dates?days=90", { headers });
      if (res.ok) setLogDates(await res.json());
    } catch { /* silent */ }
  };

  useEffect(() => { if (open) fetchDates(); }, [refreshTrigger, open]);

  const logMap = new Map(logDates.map(l => [l.logDate, l.isCompleted]));

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const plansOnDate = (dateStr: string) => {
    if (!plans) return [];
    return plans.filter(p => {
      if (!p.startDate && !p.endDate) return false;
      const start = p.startDate ?? p.endDate!;
      const end = p.endDate ?? p.startDate!;
      return dateStr >= start && dateStr <= end;
    });
  };

  const getDateStyle = (dateStr: string) => {
    const isToday = dateStr === today;
    const isPast = dateStr < today;
    const isFuture = dateStr > today;
    const isSelected = dateStr === selectedDate;
    const hasLog = logMap.has(dateStr);
    const isCompleted = logMap.get(dateStr) === true;

    if (isSelected) return "bg-teal-600 text-white font-bold ring-2 ring-teal-300";
    if (isToday) return "bg-teal-500 text-white font-bold shadow-sm";
    if (isFuture) return "text-slate-500 hover:bg-slate-100 cursor-pointer";
    if (isPast && isCompleted) return "bg-emerald-100 text-emerald-800 font-medium hover:bg-emerald-200 cursor-pointer";
    if (isPast && hasLog) return "bg-amber-100 text-amber-800 font-medium hover:bg-amber-200 cursor-pointer";
    if (isPast) return "text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer";
    return "text-slate-600 hover:bg-slate-100";
  };

  const cells: (string | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(year, month, i + 1);
      return d.toISOString().split("T")[0];
    }),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm p-0 gap-0 overflow-hidden rounded-3xl border-0 shadow-2xl [&>button]:hidden">
        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-teal-600 to-emerald-600 text-white">
          <div className="flex items-center gap-2">
            <CalendarDays size={17} />
            <span className="text-base font-semibold">{MONTHS[month]} {year}</span>
          </div>
          <button onClick={() => onOpenChange(false)} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center justify-center gap-2 py-2 bg-white border-b border-slate-100">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>
            <ChevronLeft size={16} />
          </Button>
          <Button variant="ghost" className="h-8 px-3 text-xs text-teal-600 hover:bg-teal-50 font-medium" onClick={() => setViewDate(new Date())}>
            Today
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>
            <ChevronRight size={16} />
          </Button>
        </div>

        <div className="px-4 pt-3">
          <div className="grid grid-cols-7">
            {DAYS.map(d => (
              <div key={d} className="text-center text-[11px] font-semibold text-slate-400 py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-1.5 pb-2">
            {cells.map((dateStr, i) => {
              const dayPlans = dateStr ? plansOnDate(dateStr) : [];
              return (
                <div key={i} className="flex flex-col items-center justify-start py-0.5 gap-0.5">
                  {dateStr ? (
                    <>
                      <button
                        onClick={() => onSelectDate(dateStr)}
                        className={cn("w-9 h-9 rounded-full text-sm flex items-center justify-center transition-all duration-100", getDateStyle(dateStr))}
                      >
                        {new Date(dateStr + "T00:00:00").getDate()}
                      </button>
                      {dayPlans.length > 0 && (
                        <div className="flex gap-0.5">
                          {dayPlans.slice(0, 3).map(p => (
                            <div key={p.id} className={cn("w-1.5 h-1.5 rounded-full", p.status === "completed" ? "bg-emerald-400" : "bg-blue-400")} title={p.title} />
                          ))}
                        </div>
                      )}
                    </>
                  ) : <div className="w-9 h-9" />}
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-5 pb-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-slate-100 pt-3 bg-slate-50/60">
          {[
            { color: "bg-teal-500", label: "Today" },
            { color: "bg-emerald-200", label: "Log Completed" },
            { color: "bg-amber-200", label: "Log In Progress" },
            { color: "bg-blue-400", label: "Plan Active" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={cn("w-2.5 h-2.5 rounded-full", color)} />
              <span className="text-[11px] text-slate-500">{label}</span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
