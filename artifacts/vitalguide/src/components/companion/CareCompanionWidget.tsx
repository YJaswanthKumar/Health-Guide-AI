import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { MessageCircleHeart, ChevronRight, Loader2, Sparkles } from "lucide-react";

type CompanionMessage = {
  id: number;
  role: string;
  content: string;
  createdAt: string;
};

const PROACTIVE_TIMEOUT_MS = 12000;

export default function CareCompanionWidget() {
  const [, setLocation] = useLocation();
  const [message, setMessage] = useState<CompanionMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      try {
        const latestRes = await fetch("/api/companion/latest", {
          credentials: "include",
          signal: controller.signal,
        });
        if (!latestRes.ok) throw new Error("fetch failed");
        const latest: CompanionMessage | null = await latestRes.json();

        const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
        const isRecent =
          latest &&
          latest.role === "assistant" &&
          new Date(latest.createdAt) > fourHoursAgo;

        if (isRecent) {
          if (!cancelled) { setMessage(latest); setLoading(false); }
          return;
        }

        if (!cancelled) setGenerating(true);

        const timeoutId = setTimeout(() => controller.abort(), PROACTIVE_TIMEOUT_MS);

        try {
          const proactiveRes = await fetch("/api/companion/proactive", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (!proactiveRes.ok) throw new Error("proactive failed");
          const data = await proactiveRes.json() as { message: CompanionMessage };
          if (!cancelled) { setMessage(data.message); setLoading(false); setGenerating(false); }
        } catch (proactiveErr) {
          clearTimeout(timeoutId);
          throw proactiveErr;
        }
      } catch {
        if (!cancelled) { setLoading(false); setGenerating(false); }
      }
    }

    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const preview = message?.content
    ? message.content.length > 120 ? message.content.slice(0, 117) + "…" : message.content
    : null;

  return (
    <button
      onClick={() => setLocation("/companion")}
      className="w-full text-left group"
      aria-label="Open Care Companion"
    >
      <div className="flex items-center gap-4 bg-gradient-to-r from-teal-600 to-emerald-600 rounded-2xl px-5 py-4 shadow-md group-hover:shadow-lg transition-all duration-200 group-hover:from-teal-700 group-hover:to-emerald-700">
        <div className="w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-white/30 transition-colors">
          <MessageCircleHeart className="w-6 h-6 text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-white font-semibold text-sm">Care Companion</span>
            <span className="bg-white/20 text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5" /> AI
            </span>
          </div>
          {loading || generating ? (
            <div className="flex items-center gap-2 text-white/70 text-xs">
              <Loader2 className="w-3 h-3 animate-spin" />
              {generating ? "Your companion is thinking…" : "Loading…"}
            </div>
          ) : preview ? (
            <p className="text-white/90 text-xs leading-relaxed line-clamp-2">{preview}</p>
          ) : (
            <p className="text-white/70 text-xs">Tap to open your personal care chat</p>
          )}
        </div>

        <ChevronRight className="w-5 h-5 text-white/70 group-hover:text-white group-hover:translate-x-0.5 transition-all flex-shrink-0" />
      </div>
    </button>
  );
}
