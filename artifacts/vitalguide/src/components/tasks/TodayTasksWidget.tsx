import { useState, useCallback } from "react";
import { CheckCircle2, Circle, Trash2, Plus, Loader2, ListTodo, RefreshCw, Pill, Droplets, Dumbbell, Apple, Clock, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

export type Task = {
  id: number;
  title: string;
  description?: string | null;
  category: string;
  priority: string;
  dueTime?: string | null;
  status: string;
  completed: boolean;
  sourceAgent: string | null;
  createdAt: string;
};

type Props = {
  tasks: Task[];
  loading: boolean;
  onRefresh: () => void;
  onTasksChanged: () => void;
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

export default function TodayTasksWidget({ tasks, loading, onRefresh, onTasksChanged }: Props) {
  const { toast } = useToast();
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [agentLoading, setAgentLoading] = useState(false);
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const pending = tasks.filter(t => !t.completed);
  const done = tasks.filter(t => t.completed);

  const completeTask = useCallback(async (id: number) => {
    setCompletingId(id);
    try {
      const res = await fetch(`/api/tasks/${id}/complete`, { method: "PATCH", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      onTasksChanged();
    } catch {
      toast({ title: "Failed to complete task", variant: "destructive" });
    } finally {
      setCompletingId(null);
    }
  }, [onTasksChanged, toast]);

  const deleteTask = useCallback(async (id: number) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      onTasksChanged();
    } catch {
      toast({ title: "Failed to delete task", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }, [onTasksChanged, toast]);

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
      onTasksChanged();
      toast({ title: "Task added" });
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
      onTasksChanged();
      toast({ title: "Tasks updated by Care Planner", description: "Your agent has refreshed your task list." });
    } catch {
      toast({ title: "Agent unavailable", description: "Could not reach Care Planner. Please try again later.", variant: "destructive" });
    } finally {
      setAgentLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
          <ListTodo className="w-4 h-4 text-teal-600" /> Today's Tasks
          {pending.length > 0 && (
            <Badge className="bg-teal-100 text-teal-700 border-teal-200 text-[10px] font-bold">{pending.length}</Badge>
          )}
        </h2>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-slate-500 hover:text-teal-600"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw className={`w-3 h-3 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs border-teal-200 text-teal-700 hover:bg-teal-50"
            onClick={refreshWithAgent}
            disabled={agentLoading}
          >
            {agentLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Star className="w-3 h-3 mr-1" />}
            AI Plan
          </Button>
        </div>
      </div>

      {/* Add task form */}
      <form onSubmit={addTask} className="flex gap-2">
        <Input
          className="h-9 text-sm flex-1 border-slate-200"
          placeholder="Add a task…"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          disabled={adding}
        />
        <Button type="submit" size="sm" className="h-9 px-3 bg-teal-600 hover:bg-teal-700 text-white" disabled={adding || !newTitle.trim()}>
          {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        </Button>
      </form>

      {loading ? (
        <div className="flex items-center justify-center py-6 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading tasks…
        </div>
      ) : tasks.length === 0 ? (
        <div className="py-6 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
          <ListTodo className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No tasks yet.</p>
          <p className="text-xs text-slate-400 mt-1">Add one above or tap "AI Plan" to let your agent create tasks.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pending.map(task => (
            <TaskRow
              key={task.id}
              task={task}
              onComplete={() => completeTask(task.id)}
              onDelete={() => deleteTask(task.id)}
              completing={completingId === task.id}
              deleting={deletingId === task.id}
            />
          ))}

          {done.length > 0 && (
            <div className="pt-2">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Completed ({done.length})</p>
              {done.slice(0, 3).map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onComplete={() => {}}
                  onDelete={() => deleteTask(task.id)}
                  completing={false}
                  deleting={deletingId === task.id}
                  dimmed
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TaskRow({
  task, onComplete, onDelete, completing, deleting, dimmed,
}: {
  task: Task;
  onComplete: () => void;
  onDelete: () => void;
  completing: boolean;
  deleting: boolean;
  dimmed?: boolean;
}) {
  const icon = categoryIcon[task.category] ?? categoryIcon.general;
  const pColor = priorityColor[task.priority] ?? priorityColor.medium;

  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${dimmed ? "bg-slate-50 border-slate-100 opacity-60" : "bg-white border-slate-100 hover:border-teal-100 hover:bg-teal-50/20"}`}>
      <button
        onClick={onComplete}
        disabled={completing || task.completed}
        className="flex-shrink-0 text-slate-300 hover:text-teal-500 transition-colors disabled:opacity-50"
        aria-label="Complete task"
      >
        {completing ? (
          <Loader2 className="w-4 h-4 animate-spin text-teal-500" />
        ) : task.completed ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        ) : (
          <Circle className="w-4 h-4" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-medium ${task.completed ? "line-through text-slate-400" : "text-slate-800"}`}>
            {task.title}
          </span>
          {task.sourceAgent === "agent3" && (
            <span className="text-[9px] bg-teal-50 text-teal-600 border border-teal-100 rounded-full px-1.5 py-0 font-semibold">AI</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-slate-400 flex items-center gap-1 text-[11px]">
            {icon} {task.category}
          </span>
          {task.dueTime && (
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" /> {task.dueTime}
            </span>
          )}
          <Badge variant="outline" className={`text-[9px] py-0 px-1.5 h-4 ${pColor}`}>{task.priority}</Badge>
        </div>
      </div>

      <button
        onClick={onDelete}
        disabled={deleting}
        className="flex-shrink-0 text-slate-200 hover:text-red-400 transition-colors p-1"
        aria-label="Delete task"
      >
        {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}
