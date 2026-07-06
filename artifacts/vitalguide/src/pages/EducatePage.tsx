import { useState, useEffect, useRef } from "react";
import { useListConversations, useGetConversationMessages, useCreateConversation, getGetConversationMessagesQueryKey, getListConversationsQueryKey, type Message, type Conversation } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookOpen, Plus, MessageSquare, Menu, X, Search, Clock, Sparkles, Bot, User, Send, WifiOff } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { queryClient } from "@/lib/queryClient";

const TOPICS = [
  {
    id: "nutrition",
    title: "Nutrition",
    icon: "🥗",
    color: "from-green-50 to-emerald-50 border-green-200 hover:border-green-400",
    badge: "bg-green-100 text-green-700",
    desc: "Macronutrients, vitamins, meal planning & healthy eating habits",
    prompt: "I want to learn about nutrition. Can you explain the fundamentals of healthy eating, macronutrients, and how diet affects overall health?",
  },
  {
    id: "exercise",
    title: "Exercise & Fitness",
    icon: "🏃",
    color: "from-orange-50 to-amber-50 border-orange-200 hover:border-orange-400",
    badge: "bg-orange-100 text-orange-700",
    desc: "Workouts, fitness science, strength, cardio & recovery",
    prompt: "Explain the science of exercise and fitness. What are the key principles for building strength, improving cardio, and recovering well?",
  },
  {
    id: "mental-health",
    title: "Mental Health",
    icon: "🧠",
    color: "from-purple-50 to-violet-50 border-purple-200 hover:border-purple-400",
    badge: "bg-purple-100 text-purple-700",
    desc: "Stress management, sleep, anxiety & mindfulness",
    prompt: "Help me understand mental health better. What are the key factors that affect mental wellbeing, and what evidence-based strategies can I use to manage stress and anxiety?",
  },
  {
    id: "healthy-lifestyle",
    title: "Healthy Lifestyle",
    icon: "🌿",
    color: "from-teal-50 to-cyan-50 border-teal-200 hover:border-teal-400",
    badge: "bg-teal-100 text-teal-700",
    desc: "Daily habits, prevention, hydration & wellness routines",
    prompt: "What does a truly healthy lifestyle look like? Teach me the science-backed fundamentals of daily habits, hydration, sleep, and preventive health.",
  },
  {
    id: "medical-reports",
    title: "Medical Reports",
    icon: "📋",
    color: "from-blue-50 to-sky-50 border-blue-200 hover:border-blue-400",
    badge: "bg-blue-100 text-blue-700",
    desc: "Reading lab results, blood work & understanding tests",
    prompt: "Help me understand how to read and interpret common medical reports and lab results. What are the key values I should pay attention to in a standard blood test?",
  },
  {
    id: "medication-safety",
    title: "Medication Safety",
    icon: "💊",
    color: "from-red-50 to-rose-50 border-red-200 hover:border-red-400",
    badge: "bg-red-100 text-red-700",
    desc: "Side effects, drug interactions, dosage & safety",
    prompt: "What do I need to know about medication safety? Explain how to manage side effects, understand drug interactions, and follow safe dosage practices.",
  },
];

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function EducatePage() {
  const { data: conversations, isLoading: isLoadingConvos } = useListConversations({ query: { queryKey: getListConversationsQueryKey() } });
  const createConversation = useCreateConversation();

  const eduConvos = (conversations?.filter((c: Conversation) => c.mode === "education") ?? [])
    .slice()
    .sort((a: Conversation, b: Conversation) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime());

  const [activeId, setActiveId] = useState<number | null>(null);
  const [autoPrompt, setAutoPrompt] = useState<string | undefined>(undefined);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!activeId && eduConvos.length > 0) {
      setActiveId(eduConvos[0].id);
    }
  }, [activeId, eduConvos]);

  const filteredConvos = search.trim()
    ? eduConvos.filter((c: Conversation) => c.title.toLowerCase().includes(search.toLowerCase()))
    : eduConvos;

  const startTopic = (topic: typeof TOPICS[number]) => {
    createConversation.mutate(
      { data: { mode: "education", title: topic.title } },
      {
        onSuccess: (data: Conversation) => {
          setActiveId(data.id);
          setAutoPrompt(topic.prompt);
          queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
          setSidebarOpen(false);
        }
      }
    );
  };

  const handleNew = () => {
    createConversation.mutate(
      { data: { mode: "education", title: "Learning Session" } },
      {
        onSuccess: (data: Conversation) => {
          setActiveId(data.id);
          setAutoPrompt(undefined);
          queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
          setSidebarOpen(false);
        }
      }
    );
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full gap-3 p-4 md:p-0">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-indigo-600" />
          Education
        </h1>
        <div className="flex items-center gap-1">
          <Button
            onClick={handleNew}
            disabled={createConversation.isPending}
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            title="New session"
          >
            <Plus className="w-4 h-4" />
          </Button>
          <button className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" onClick={() => setSidebarOpen(false)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-50 border border-indigo-100 rounded-lg">
        <Sparkles className="w-3 h-3 text-indigo-600 flex-shrink-0" />
        <span className="text-[11px] font-medium text-indigo-700">Agent 5 — Nutrition Intelligence</span>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search topics…"
          className="pl-8 h-8 text-xs border-slate-200"
        />
      </div>

      <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
        {isLoadingConvos ? (
          Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)
        ) : filteredConvos.length === 0 ? (
          <div className="text-sm text-slate-500 text-center py-6 px-4 bg-slate-50 rounded-lg border border-slate-100">
            {search ? "No matching topics" : "No topics explored yet. Start one below."}
          </div>
        ) : (
          filteredConvos.map((c: Conversation) => (
            <button
              key={c.id}
              onClick={() => { setActiveId(c.id); setAutoPrompt(undefined); setSidebarOpen(false); }}
              className={`w-full text-left px-3 py-2.5 text-sm rounded-lg truncate transition-all flex flex-col gap-0.5 border ${
                activeId === c.id
                  ? "bg-indigo-50 border-indigo-200 text-indigo-900"
                  : "bg-transparent border-transparent text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span className="flex items-center gap-2">
                <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${activeId === c.id ? "text-indigo-500" : "text-slate-400"}`} />
                <span className="truncate font-medium text-xs">{c.title}</span>
              </span>
              <span className="flex items-center gap-1 text-[10px] text-slate-400 pl-5">
                <Clock className="w-2.5 h-2.5" />
                {formatRelativeTime(String(c.updatedAt ?? c.createdAt))}
              </span>
            </button>
          ))
        )}
      </div>

      <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-3">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Quick Topics</p>
        <div className="grid grid-cols-2 gap-1.5">
          {TOPICS.map(t => (
            <button
              key={t.id}
              onClick={() => startTopic(t)}
              disabled={createConversation.isPending}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-white border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50 transition-all text-left group"
            >
              <span className="text-base">{t.icon}</span>
              <span className="text-[10px] font-medium text-slate-700 group-hover:text-indigo-700 truncate">{t.title}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto h-[calc(100vh-8rem)] flex flex-col md:flex-row gap-0 md:gap-6 relative animate-in fade-in duration-500">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — desktop: static, mobile: drawer */}
      <div className={`
        flex-shrink-0 flex flex-col
        md:w-72 md:static md:translate-x-0
        fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-100 shadow-xl
        transition-transform duration-300 ease-in-out
        md:bg-transparent md:border-none md:shadow-none
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `}>
        <SidebarContent />
      </div>

      {/* Main area */}
      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 h-full overflow-hidden flex flex-col">
        {/* Mobile topbar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-slate-100">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 border border-slate-200"
          >
            <Menu className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate">
              {activeId ? (eduConvos.find((c: Conversation) => c.id === activeId)?.title ?? "Education") : "Health Education"}
            </p>
          </div>
          <Button
            onClick={handleNew}
            disabled={createConversation.isPending}
            size="sm"
            className="h-8 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> New
          </Button>
        </div>

        {activeId ? (
          <EducationChat
            key={activeId}
            conversationId={activeId}
            autoPrompt={autoPrompt}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-6 md:p-8 bg-slate-50/50 overflow-y-auto">
            <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mb-5">
              <BookOpen className="w-8 h-8 text-indigo-600" />
            </div>
            <h3 className="text-xl md:text-2xl font-bold text-slate-900 mb-2 tracking-tight text-center">What would you like to learn?</h3>
            <p className="text-slate-500 mb-8 max-w-lg text-center text-sm leading-relaxed">
              Explore evidence-based health topics with your AI guide. Choose a topic below or ask any health question.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-3xl w-full">
              {TOPICS.map((topic) => (
                <button
                  key={topic.id}
                  onClick={() => startTopic(topic)}
                  disabled={createConversation.isPending}
                  className={`p-4 bg-gradient-to-br ${topic.color} border rounded-xl text-left hover:shadow-md transition-all group flex flex-col gap-2`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{topic.icon}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${topic.badge}`}>
                      Explore
                    </span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900 text-sm mb-1">{topic.title}</h4>
                    <p className="text-xs text-slate-500 leading-relaxed">{topic.desc}</p>
                  </div>
                </button>
              ))}
            </div>

            <Button
              onClick={handleNew}
              className="mt-8 bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm px-6"
              disabled={createConversation.isPending}
            >
              <Plus className="w-4 h-4 mr-2" />
              Ask Your Own Question
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function EducationChat({ conversationId, autoPrompt }: { conversationId: number; autoPrompt?: string }) {
  const { data: msgs, isLoading } = useGetConversationMessages(conversationId, {
    query: { enabled: !!conversationId, queryKey: getGetConversationMessagesQueryKey(conversationId) }
  });

  if (isLoading) return (
    <div className="h-full p-8 flex flex-col gap-6">
      <Skeleton className="h-24 w-3/4 self-start rounded-2xl rounded-tl-sm" />
      <Skeleton className="h-20 w-3/4 self-end rounded-2xl rounded-tr-sm" />
      <Skeleton className="h-40 w-3/4 self-start rounded-2xl rounded-tl-sm" />
    </div>
  );

  return (
    <EducationChatPanel
      conversationId={conversationId}
      initialMessages={msgs ?? []}
      autoPrompt={autoPrompt}
    />
  );
}

function EducationChatPanel({
  conversationId,
  initialMessages,
  autoPrompt,
}: {
  conversationId: number;
  initialMessages: Message[];
  autoPrompt?: string;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoFiredRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Sync when conversation switches
  useEffect(() => {
    setMessages(initialMessages);
    autoFiredRef.current = false;
    setError(null);
  }, [conversationId]);

  // Keep in sync if DB messages update
  useEffect(() => {
    if (initialMessages.length > 0) setMessages(initialMessages);
  }, [initialMessages]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  const sendMessage = async (content: string) => {
    if (!content.trim() || isThinking) return;
    setError(null);

    // Optimistic user message
    const tempId = Date.now();
    const optimisticUser: Message = {
      id: tempId,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimisticUser]);
    setIsThinking(true);

    try {
      const res = await fetch(`/api/education-agent/conversations/${conversationId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
        setError(errBody.error ?? "Something went wrong. Please try again.");
        setMessages(prev => prev.filter(m => m.id !== tempId));
        return;
      }

      const data = await res.json() as { userMessage: Message; assistantMessage: Message };
      // Replace optimistic message with real DB messages
      setMessages(prev => [
        ...prev.filter(m => m.id !== tempId),
        data.userMessage,
        data.assistantMessage,
      ]);
      queryClient.invalidateQueries({ queryKey: getGetConversationMessagesQueryKey(conversationId) });
    } catch (err: any) {
      setError(err?.message ?? "Network error. Please check your connection.");
      setMessages(prev => prev.filter(m => m.id !== tempId));
    } finally {
      setIsThinking(false);
    }
  };

  // Auto-fire topic prompt once
  useEffect(() => {
    if (!autoPrompt || autoFiredRef.current || isThinking) return;
    autoFiredRef.current = true;
    const t = setTimeout(() => sendMessage(autoPrompt), 300);
    return () => clearTimeout(t);
  }, [autoPrompt]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const text = input;
    setInput("");
    sendMessage(text);
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl overflow-hidden w-full">
      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 text-red-800 p-3 flex gap-2.5 items-start">
          <WifiOff className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Unable to get a response</p>
            <p className="text-xs mt-0.5 opacity-80">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-xs opacity-50 hover:opacity-100 flex-shrink-0 ml-1 mt-0.5">✕</button>
        </div>
      )}

      <ScrollArea className="flex-1 p-4 md:p-6">
        <div className="space-y-6">
          {messages.length === 0 && !isThinking && (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center mb-4">
                <Bot className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-medium text-slate-900">How can I help?</h3>
              <p className="mt-1 max-w-xs text-sm">Send a message to start the conversation.</p>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-3 md:gap-4 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${
                msg.role === "user" ? "bg-teal-600 text-white" : "bg-indigo-100 text-indigo-700"
              }`}>
                {msg.role === "user"
                  ? <User className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  : <Bot className="w-3.5 h-3.5 md:w-4 md:h-4" />}
              </div>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm md:text-[15px] leading-relaxed shadow-sm ${
                msg.role === "user"
                  ? "bg-teal-600 text-white rounded-tr-sm"
                  : "bg-indigo-50 text-indigo-900 border border-indigo-100 rounded-tl-sm"
              }`}>
                <div className="whitespace-pre-wrap font-sans break-words">{msg.content}</div>
              </div>
            </div>
          ))}

          {/* Agent 5 thinking indicator */}
          {isThinking && (
            <div className="flex gap-3 md:gap-4">
              <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center flex-shrink-0 mt-1">
                <Bot className="w-3.5 h-3.5 md:w-4 md:h-4" />
              </div>
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm px-4 py-3 bg-indigo-50 border border-indigo-100 shadow-sm">
                <div className="flex items-center gap-2 text-xs text-indigo-600 mb-2">
                  <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                  <span className="font-medium animate-pulse">Agent 5 is researching your question…</span>
                </div>
                <div className="flex gap-1 items-center">
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} className="h-2" />
        </div>
      </ScrollArea>

      <div className="p-3 md:p-4 border-t border-slate-100 bg-slate-50/80">
        <form onSubmit={handleSubmit} className="flex gap-2 md:gap-3 max-w-4xl mx-auto">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask a health question…"
            className="flex-1 bg-white border-slate-200 shadow-sm h-11 md:h-12 text-sm md:text-base rounded-full px-4 md:px-5 focus-visible:ring-indigo-500"
            disabled={isThinking}
          />
          <Button
            type="submit"
            disabled={!input.trim() || isThinking}
            className="h-11 w-11 md:h-12 md:w-12 rounded-full p-0 flex-shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
          >
            <Send className="w-4 h-4 md:w-5 md:h-5 ml-0.5" />
          </Button>
        </form>
      </div>
    </div>
  );
}
