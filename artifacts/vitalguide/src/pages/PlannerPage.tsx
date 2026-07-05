import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@clerk/react";
import { useListPlans, useCreatePlan, useUpdatePlan, useDeletePlan, useGetTodayLog, useListConversations, useCreateConversation, useGetConversationMessages, getGetTodayLogQueryKey, getGetConversationMessagesQueryKey, getListPlansQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CalendarHeart, Plus, Activity, Bot, CheckCircle2, Clock, CalendarDays, ChevronRight, Pencil, Trash2, AlarmClock } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ChatInterface from "@/components/chat/ChatInterface";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import TodayLogModal, { type DailyLog } from "@/components/log/TodayLogModal";
import CalendarModal from "@/components/log/CalendarModal";
import TaskListPanel from "@/components/tasks/TaskListPanel";
import type { Task } from "@/components/tasks/TodayTasksWidget";

const planSchema = z.object({
  title: z.string().min(2),
  type: z.string(),
  description: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.string().optional(),
});

type PlanFormValues = z.infer<typeof planSchema>;

export default function PlannerPage() {
  const { data: plans } = useListPlans();
  const { data: todayLog, refetch: refetchTodayLog } = useGetTodayLog({ query: { retry: false, queryKey: getGetTodayLogQueryKey() } });
  const { data: convos } = useListConversations();
  const createPlan = useCreatePlan();
  const updatePlan = useUpdatePlan();
  const deletePlan = useDeletePlan();
  const createConversation = useCreateConversation();
  const { getToken } = useAuth();
  const { toast } = useToast();

  const [isAddPlanOpen, setIsAddPlanOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null);
  const [deletePlanId, setDeletePlanId] = useState<number | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calRefresh, setCalRefresh] = useState(0);

  const [logOpen, setLogOpen] = useState(false);
  const [logDate, setLogDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [selectedLog, setSelectedLog] = useState<DailyLog | null>(null);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);

  const plannerConvos = convos?.filter(c => c.mode === "planner") || [];
  const [activeConvoId, setActiveConvoId] = useState<number | null>(null);

  const planForm = useForm<PlanFormValues>({
    resolver: zodResolver(planSchema),
    defaultValues: { title: "", type: "custom", description: "", startDate: "", endDate: "", status: "active" }
  });

  const fetchTasks = useCallback(async () => {
    setTasksLoading(true);
    try {
      const res = await fetch("/api/tasks", { credentials: "include" });
      if (res.ok) setTasks(await res.json());
    } catch { /* ignore */ } finally {
      setTasksLoading(false);
    }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const onPlanSubmit = (data: PlanFormValues) => {
    const payload = {
      ...data,
      startDate: data.startDate || undefined,
      endDate: data.endDate || undefined,
    };
    if (editingPlanId) {
      updatePlan.mutate({ id: editingPlanId, data: payload }, {
        onSuccess: () => {
          toast({ title: "Plan updated", description: "Your health plan was updated." });
          setIsAddPlanOpen(false);
          setEditingPlanId(null);
          planForm.reset();
          queryClient.invalidateQueries({ queryKey: getListPlansQueryKey() });
        }
      });
    } else {
      createPlan.mutate({ data: payload }, {
        onSuccess: () => {
          toast({ title: "Plan created", description: "Your new health plan is active." });
          setIsAddPlanOpen(false);
          planForm.reset();
          queryClient.invalidateQueries({ queryKey: getListPlansQueryKey() });
        }
      });
    }
  };

  const openEditPlan = (plan: NonNullable<typeof plans>[number]) => {
    setEditingPlanId(plan.id);
    planForm.reset({
      title: plan.title,
      type: plan.type,
      description: plan.description || "",
      startDate: plan.startDate || "",
      endDate: plan.endDate || "",
      status: plan.status || "active",
    });
    setIsAddPlanOpen(true);
  };

  const openNewPlan = () => {
    setEditingPlanId(null);
    planForm.reset({ title: "", type: "custom", description: "", startDate: "", endDate: "", status: "active" });
    setIsAddPlanOpen(true);
  };

  const confirmDeletePlan = () => {
    if (deletePlanId == null) return;
    deletePlan.mutate({ id: deletePlanId }, {
      onSuccess: () => {
        toast({ title: "Plan deleted" });
        setDeletePlanId(null);
        queryClient.invalidateQueries({ queryKey: getListPlansQueryKey() });
      }
    });
  };

  const startAssistant = () => {
    createConversation.mutate({ data: { mode: "planner", title: "Planner Assistant" } }, {
      onSuccess: (data) => {
        setActiveConvoId(data.id);
        queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
      }
    });
  };

  if (!activeConvoId && plannerConvos.length > 0) {
    setActiveConvoId(plannerConvos[plannerConvos.length - 1].id);
  }

  const openLogForDate = useCallback(async (date: string) => {
    setLogDate(date);
    try {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const isToday = date === new Date().toISOString().split("T")[0];
      const url = isToday ? "/api/logs/today" : `/api/logs/date/${date}`;
      const res = await fetch(url, { headers });
      if (res.ok) setSelectedLog(await res.json());
      else setSelectedLog(null);
    } catch { setSelectedLog(null); }
    setLogOpen(true);
  }, [getToken]);

  const openTodayLog = () => openLogForDate(new Date().toISOString().split("T")[0]);

  const handleLogSaved = (log: DailyLog) => {
    setSelectedLog(log);
    refetchTodayLog();
    queryClient.invalidateQueries({ queryKey: getGetTodayLogQueryKey() });
    setCalRefresh(n => n + 1);
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      medication: "bg-red-50 text-red-700 border-red-200",
      diet: "bg-orange-50 text-orange-700 border-orange-200",
      fitness: "bg-blue-50 text-blue-700 border-blue-200",
      recovery: "bg-indigo-50 text-indigo-700 border-indigo-200",
      custom: "bg-slate-100 text-slate-700 border-slate-200",
    };
    return colors[type] || colors.custom;
  };

  const isCompleted = !!(todayLog as DailyLog | undefined)?.isCompleted;
  const hasLog = !!todayLog;

  return (
    <div className="max-w-7xl mx-auto h-[calc(100vh-8rem)] flex flex-col lg:flex-row gap-6 animate-in fade-in duration-500">

      {/* Left Column */}
      <div className="flex-1 overflow-y-auto space-y-7 pr-2 custom-scrollbar">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2 tracking-tight">
              <CalendarHeart className="w-6 h-6 text-blue-700" />
              Plan Tracker
            </h1>
            <p className="text-sm text-slate-500 mt-1">Manage plans, tasks, and daily logs</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 border-slate-200" onClick={() => setShowCalendar(true)}>
              <CalendarDays size={14} /> Calendar
            </Button>
            <Dialog open={isAddPlanOpen} onOpenChange={(open) => { setIsAddPlanOpen(open); if (!open) setEditingPlanId(null); }}>
              <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm" size="sm" onClick={openNewPlan}>
                  <Plus className="w-4 h-4 mr-1.5" /> Add Plan
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-xl font-semibold">{editingPlanId ? "Edit Plan" : "Create New Plan"}</DialogTitle>
                </DialogHeader>
                <Form {...planForm}>
                  <form onSubmit={planForm.handleSubmit(onPlanSubmit)} className="space-y-5 pt-4">
                    <FormField control={planForm.control} name="title" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Plan Title</FormLabel>
                        <FormControl><Input className="h-11" placeholder="e.g. Daily Vitamins" {...field} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={planForm.control} name="type" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl><SelectTrigger className="h-11"><SelectValue placeholder="Select category" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="medication">Medication</SelectItem>
                            <SelectItem value="diet">Diet & Nutrition</SelectItem>
                            <SelectItem value="fitness">Fitness & Exercise</SelectItem>
                            <SelectItem value="recovery">Rest & Recovery</SelectItem>
                            <SelectItem value="custom">Custom Goal</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-3">
                      <FormField control={planForm.control} name="startDate" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start Date</FormLabel>
                          <FormControl><Input type="date" className="h-11" {...field} /></FormControl>
                        </FormItem>
                      )} />
                      <FormField control={planForm.control} name="endDate" render={({ field }) => (
                        <FormItem>
                          <FormLabel>End Date</FormLabel>
                          <FormControl><Input type="date" className="h-11" min={planForm.watch("startDate") || undefined} {...field} /></FormControl>
                        </FormItem>
                      )} />
                    </div>
                    {editingPlanId && (
                      <FormField control={planForm.control} name="status" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger className="h-11"><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )} />
                    )}
                    <FormField control={planForm.control} name="description" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Details / Notes</FormLabel>
                        <FormControl><Textarea className="resize-none min-h-[100px]" placeholder="Specific instructions..." {...field} /></FormControl>
                      </FormItem>
                    )} />
                    <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 h-11 text-base mt-2" disabled={createPlan.isPending || updatePlan.isPending}>
                      {createPlan.isPending || updatePlan.isPending ? "Saving..." : editingPlanId ? "Update Plan" : "Save Plan"}
                    </Button>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Today's Daily Check-in Banner */}
        <button onClick={openTodayLog} className="w-full text-left group">
          <Card className={`border-2 transition-all duration-200 ${isCompleted ? "border-emerald-200 bg-emerald-50/60" : "border-teal-200 bg-teal-50/60 group-hover:border-teal-300 group-hover:bg-teal-50"}`}>
            <CardContent className="px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isCompleted ? "bg-emerald-100" : "bg-teal-100"}`}>
                    {isCompleted ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <Activity className="w-5 h-5 text-teal-600" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">Today's Daily Log</span>
                      {isCompleted
                        ? <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] gap-0.5 py-0"><CheckCircle2 size={9} /> Completed</Badge>
                        : <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] gap-0.5 py-0 animate-pulse"><Clock size={9} /> In Progress</Badge>
                      }
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {isCompleted ? "Daily check-in is complete." : hasLog ? "Continue filling in your log." : "Tap to start your daily health log."}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-teal-600 transition-colors flex-shrink-0" />
              </div>
            </CardContent>
          </Card>
        </button>

        {/* Active Plans */}
        <section className="space-y-4">
          <h2 className="text-base font-semibold text-slate-900 tracking-tight">Your Active Plans</h2>
          {plans?.length === 0 ? (
            <div className="p-8 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center">
              <CalendarHeart className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <h3 className="text-slate-700 font-medium">No active plans</h3>
              <p className="text-sm text-slate-500 mt-1">Create a plan to start tracking your health goals.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {plans?.map(p => {
                const progress = p.progress ?? (p.status === "completed" ? 100 : p.status === "cancelled" ? null : null);
                const overdue = typeof p.daysRemaining === "number" && p.daysRemaining < 0 && p.status === "active";
                return (
                  <Card key={p.id} className="shadow-sm border-slate-200 overflow-hidden group">
                    <div className={`h-1.5 w-full ${p.status === "completed" ? "bg-emerald-400" : overdue ? "bg-rose-400" : "bg-blue-400"}`} />
                    <CardHeader className="p-5 pb-3">
                      <div className="flex justify-between items-start mb-2">
                        <Badge variant="outline" className={`capitalize font-medium ${getTypeColor(p.type)}`}>{p.type}</Badge>
                        <div className="flex items-center gap-1">
                          <Badge variant="secondary" className={p.status === "active" ? "bg-emerald-50 text-emerald-700" : p.status === "completed" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"}>{p.status}</Badge>
                          <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => openEditPlan(p)}>
                            <Pencil size={13} className="text-slate-400" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setDeletePlanId(p.id)}>
                            <Trash2 size={13} className="text-rose-400" />
                          </Button>
                        </div>
                      </div>
                      <CardTitle className="text-base font-semibold leading-tight">{p.title}</CardTitle>
                      {p.description && <p className="text-sm text-slate-600 mt-1 line-clamp-2">{p.description}</p>}

                      {(p.startDate || p.endDate) && (
                        <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-500">
                          <CalendarDays size={12} />
                          <span>{p.startDate ?? "—"} → {p.endDate ?? "—"}</span>
                          {p.durationDays != null && <span className="text-slate-400">({p.durationDays}d)</span>}
                        </div>
                      )}

                      {progress != null && (
                        <div className="mt-3 space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-500 font-medium">Progress</span>
                            <span className="font-semibold text-slate-700">{progress}%</span>
                          </div>
                          <Progress value={progress} className="h-2" />
                          {typeof p.daysRemaining === "number" && p.status === "active" && (
                            <div className={`flex items-center gap-1 text-[11px] font-medium ${overdue ? "text-rose-500" : "text-slate-400"}`}>
                              <AlarmClock size={11} />
                              {overdue ? `${Math.abs(p.daysRemaining)} days overdue` : `${p.daysRemaining} days remaining`}
                            </div>
                          )}
                        </div>
                      )}
                    </CardHeader>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        <div className="pb-8" />
      </div>

      {/* Right Column: Task Manager + Planner Assistant tabs */}
      <div className="w-full lg:w-[360px] flex-shrink-0 h-[500px] lg:h-full flex flex-col gap-4">

        {/* Task Manager Panel */}
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-0">
          <TaskListPanel tasks={tasks} loading={tasksLoading} onRefresh={fetchTasks} />
        </div>

        {/* Planner Assistant */}
        <div className="h-[280px] bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col flex-shrink-0">
          <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <Bot className="w-4 h-4 text-blue-700" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Planner Assistant</h3>
                <p className="text-[11px] text-slate-500 font-medium">Ask for routine suggestions</p>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            {activeConvoId ? (
              <PlannerChat conversationId={activeConvoId} />
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center bg-white">
                <Bot className="w-10 h-10 text-slate-200 mb-3" />
                <h4 className="text-slate-700 font-medium mb-1 text-sm">Need help planning?</h4>
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                  The assistant can help design a diet plan or suggest workout routines.
                </p>
                <Button onClick={startAssistant} className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm w-full" size="sm">
                  Start Assistant
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Today's Log Modal */}
      <TodayLogModal
        open={logOpen}
        onOpenChange={setLogOpen}
        date={logDate}
        initialLog={selectedLog}
        onSaved={handleLogSaved}
      />

      {/* Calendar Modal (Samsung-style centered) */}
      <CalendarModal
        open={showCalendar}
        onOpenChange={setShowCalendar}
        selectedDate={logDate}
        onSelectDate={(date) => { setShowCalendar(false); openLogForDate(date); }}
        refreshTrigger={calRefresh}
        plans={plans}
      />

      {/* Delete Plan Confirmation */}
      <AlertDialog open={deletePlanId != null} onOpenChange={(open) => !open && setDeletePlanId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this plan?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the plan and its progress. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={confirmDeletePlan} disabled={deletePlan.isPending}>
              {deletePlan.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PlannerChat({ conversationId }: { conversationId: number }) {
  const { data: messages } = useGetConversationMessages(conversationId, {
    query: { enabled: !!conversationId, queryKey: getGetConversationMessagesQueryKey(conversationId) }
  });
  return <ChatInterface conversationId={conversationId} initialMessages={messages || []} mode="planner" />;
}
