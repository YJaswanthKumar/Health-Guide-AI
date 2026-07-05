import { useState, useEffect, useRef } from "react";
import { MessageCircleHeart, Send, Loader2, ArrowLeft, Sparkles, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useLocation } from "wouter";

type Message = {
  id: number;
  role: string;
  content: string;
  createdAt: string;
};

export default function CompanionPage() {
  const [, setLocation] = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/companion/messages", { credentials: "include" });
        if (res.ok) {
          const data = await res.json() as Message[];
          setMessages(data);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const content = input.trim();
    if (!content || sending) return;
    setInput("");
    setSending(true);

    const tempUser: Message = {
      id: Date.now(),
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUser]);

    try {
      const res = await fetch("/api/companion/message", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as { userMessage: Message; assistantMessage: Message };
      setMessages(prev => [
        ...prev.filter(m => m.id !== tempUser.id),
        data.userMessage,
        data.assistantMessage,
      ]);
    } catch {
      setMessages(prev => [
        ...prev.filter(m => m.id !== tempUser.id),
        tempUser,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: "I'm having trouble connecting right now. Please try again in a moment.",
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="max-w-2xl mx-auto h-[calc(100vh-10rem)] flex flex-col animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/dashboard")} className="text-slate-500 hover:text-slate-700 -ml-1 p-2">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-xl flex items-center justify-center">
          <MessageCircleHeart className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-slate-900">Care Companion</h1>
            <span className="bg-teal-100 text-teal-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5" /> Agent 3
            </span>
          </div>
          <p className="text-xs text-slate-500">Your personal AI health caregiver</p>
        </div>
      </div>

      {/* Message area */}
      <div className="flex-1 overflow-y-auto bg-white border border-slate-200 rounded-2xl p-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading conversation…
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <div className="w-14 h-14 bg-gradient-to-br from-teal-100 to-emerald-100 rounded-2xl flex items-center justify-center">
              <MessageCircleHeart className="w-7 h-7 text-teal-600" />
            </div>
            <div>
              <h3 className="text-slate-700 font-semibold">Start a conversation</h3>
              <p className="text-sm text-slate-500 mt-1 max-w-xs leading-relaxed">
                Your Care Companion is proactive about your health. Ask anything — medication reminders, hydration, exercise, nutrition, or just how you're feeling.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center mt-1">
              {["Have I taken my meds today?", "How's my hydration looking?", "What should I eat today?"].map(s => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="text-xs bg-teal-50 text-teal-700 border border-teal-100 rounded-full px-3 py-1.5 hover:bg-teal-100 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map(msg => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {sending && (
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Bot className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="bg-slate-100 rounded-2xl rounded-tl-sm px-4 py-2.5 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
                  <span className="text-xs text-slate-500">Care Planner is thinking…</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="mt-3 flex gap-2 items-end">
        <Textarea
          className="flex-1 min-h-[44px] max-h-[120px] resize-none border-slate-200 rounded-xl text-sm"
          placeholder="Ask your Care Companion anything…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending}
          rows={1}
        />
        <Button
          onClick={send}
          disabled={!input.trim() || sending}
          className="h-11 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-xl flex-shrink-0"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
      <p className="text-[11px] text-slate-400 text-center mt-2">Not medical advice. Consult a doctor for medical decisions.</p>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const time = new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (isUser) {
    return (
      <div className="flex items-end gap-2 justify-end">
        <div className="max-w-[80%]">
          <div className="bg-teal-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed">
            {message.content}
          </div>
          <p className="text-[10px] text-slate-400 mt-1 text-right">{time}</p>
        </div>
        <div className="w-7 h-7 bg-slate-200 rounded-lg flex items-center justify-center flex-shrink-0 mb-5">
          <User className="w-3.5 h-3.5 text-slate-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2.5">
      <div className="w-7 h-7 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0 mb-5">
        <Bot className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="max-w-[80%]">
        <div className="bg-slate-50 border border-slate-100 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
        <p className="text-[10px] text-slate-400 mt-1">{time}</p>
      </div>
    </div>
  );
}
