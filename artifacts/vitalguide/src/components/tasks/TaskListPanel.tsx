import { useState, useCallback } from "react";
import { CheckCircle2, Circle, Trash2, Plus, Loader2, ListTodo, RefreshCw, Star, Pill, Droplets, Dumbbell, Apple, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import type { Task } from "@/components/tasks/TodayTasksWidget";

type Props = {
  tasks: Task[];
  loading: boolean;
  onRefresh: () => void;
};

const categoryIcon: Record<string, React.ReactNode> = {
  medication: <Pill className="w-3 h-3" />,
  hydration: <Droplets className="w-3 h-3" />,
  exercise: <Dumbbell className="w-3 h-3" />,
  nutrition: <Apple className="w-3 h-3" />,
  general: <ListTodo className="w-3 h-3" />,
};

const priorityColor: Record<string, string> = {
  high: "text-red-600 bg-red-50 border-red-200",
  medium: "text-amber-600 bg-amber-50 border-amber-200",
  low: "text-slate-500 bg-slate-50 border-slate-200",
};

export default function TaskListPanel({ tasks, loading, onRefresh }: Props) {
  const { toast } = useToast();
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [agentLoading, setAgentLoading] = useState(false);
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "completed">("all");

  const displayed = tasks.filter(t => {
    if (filter === "pending") return !t.completed;
    if (filter === "completed") return t.completed;
    return true;
  });

  const completeTask = useCallback(async (id: number) => {
    setCompletingId(id);
    try {
      const res = await fetch(`/api/tasks/${id}/complete`, { method: "PATCH", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      onRefresh();
    } catch {
      toast({ title: "Failed to complete task", variant: "destructive" });
    } finally {
      setCompletingId(null);
    }
  }, [onRefresh, toast]);

  const deleteTask = useCallback(async (id: number) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      onRefresh();
    } catch {
      toast({ title: "Failed to delete task", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }, [onRefresh, toast]);

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      if (!res.ok) throw new Error("Failed");
      setNewTitle("");
      onRefresh();
    } catch {
      toast({ title: "Failed to add task", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const refreshWithAgent = async () => {
    setAgentLoading(true);
    try {
      const res = await fetch("/api/tasks/agent-refresh", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Agent call failed");
      onRefresh();
      toast({ title: "Tasks updated by Care Planner" });
    } catch {
      toast({ title: "Agent unavailable. Try again later.", variant: "destructive" });
    } finally {
      setAgentLoading(false);
    }
  };

  const pending = tasks.filter(t => !t.completed).length;
  const done = tasks.filter(t => t.completed).length;

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ListTodo className="w-4 h-4 text-teal-600" />
            <h3 className="text-sm font-semibold text-slate-900">Task Manager</h3>
            {pending > 0 && <Badge className="bg-teal-100 text-teal-700 border-teal-200 text-[9px] font-bold h-4 px-1.5">{pending}</Badge>}
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] text-slate-500" onClick={onRefresh} disabled={loading}>
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="outline" size="sm" className="h-6 px-2 text-[11px] border-teal-200 text-teal-700 hover:bg-teal-50" onClick={refreshWithAgent} disabled={agentLoading}>
              {agentLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Star className="w-3 h-3 mr-1" />}
              {agentLoading ? "" : "AI"}
            </Button>
          </div>
        </div>

        <form onSubmit={addTask} className="flex gap-2 mb-3">
          <Input
            className="h-8 text-xs flex-1 border-slate-200"
            placeholder="Add a task…"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            disabled={adding}
          />
          <Button type="submit" size="sm" className="h-8 px-2.5 bg-teal-600 hover:bg-teal-700 text-white" disabled={adding || !newTitle.trim()}>
            {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          </Button>
        </form>

        <div className="flex gap-1">
          {(["all", "pending", "completed"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition-colors ${filter === f ? "bg-teal-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}
            >
              {f === "all" ? `All (${tasks.length})` : f === "pending" ? `Pending (${pending})` : `Done (${done})`}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
          </div>
        ) : displayed.length === 0 ? (
          <div className="py-8 text-center">
            <ListTodo className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-xs text-slate-400">
              {filter === "pending" ? "No pending tasks" : filter === "completed" ? "No completed tasks yet" : "No tasks yet. Add one or use AI Plan."}
            </p>
          </div>
        ) : (
          displayed.map(task => {
            const icon = categoryIcon[task.category] ?? categoryIcon.general;
            const pColor = priorityColor[task.priority] ?? priorityColor.medium;
            return (
              <div key={task.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all ${task.completed ? "bg-slate-50 border-slate-100 opacity-60" : "bg-white border-slate-100 hover:border-teal-100"}`}>
                <button
                  onClick={() => !task.completed && completeTask(task.id)}
                  disabled={completingId === task.id || task.completed}
                  className="flex-shrink-0 text-slate-300 hover:text-teal-500 transition-colors disabled:opacity-50"
                >
                  {completingId === task.id ? (
                    <Loader2 className="w-4 h-4 animate-spin text-teal-500" />
                  ) : task.completed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Circle className="w-4 h-4" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium ${task.completed ? "line-through text-slate-400" : "text-slate-800"}`}>
                    {task.title}
                    {task.sourceAgent === "agent3" && (
                      <span className="ml-1.5 text-[9px] bg-teal-50 text-teal-600 border border-teal-100 rounded-full px-1.5 py-0 font-semibold">AI</span>
                    )}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-slate-400 flex items-center gap-0.5 text-[10px]">{icon} {task.category}</span>
                    {task.dueTime && <span className="text-[10px] text-slate-400 flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{task.dueTime}</span>}
                    <Badge variant="outline" className={`text-[9px] py-0 px-1 h-3.5 ${pColor}`}>{task.priority}</Badge>
                  </div>
                </div>

                <button
                  onClick={() => deleteTask(task.id)}
                  disabled={deletingId === task.id}
                  className="flex-shrink-0 text-slate-200 hover:text-red-400 transition-colors p-0.5"
                >
                  {deletingId === task.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
