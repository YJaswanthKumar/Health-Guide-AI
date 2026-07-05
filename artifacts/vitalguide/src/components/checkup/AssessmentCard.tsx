import { CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, Pill, Apple, Stethoscope, Eye, Brain, Utensils } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

export type AssessmentData = {
  summary?: string;
  possible_causes?: string[];
  severity?: "low" | "medium" | "high" | "emergency";
  recovery_suggestions?: string[];
  food_nutrition_recommendations?: string[];
  medication_guidance?: string | Record<string, unknown>;
  doctor_recommendation?: string | Record<string, unknown>;
  warning_signs?: string[];
  profile_update_suggestions?: Record<string, unknown> | null;
};

export type NutritionData = {
  recommended_foods?: string[];
  foods_to_avoid?: string[];
  meal_plan?: Record<string, unknown>;
  nutrition_tips?: string[];
  hydration_advice?: string;
};

type Props = {
  assessment: AssessmentData;
  nutrition?: NutritionData | null;
  newTasksCount?: number;
};

const severityConfig = {
  low: { label: "Low", color: "bg-emerald-100 text-emerald-800 border-emerald-200", dot: "bg-emerald-500" },
  medium: { label: "Moderate", color: "bg-amber-100 text-amber-800 border-amber-200", dot: "bg-amber-500" },
  high: { label: "High", color: "bg-orange-100 text-orange-800 border-orange-200", dot: "bg-orange-500" },
  emergency: { label: "Emergency", color: "bg-red-100 text-red-900 border-red-200", dot: "bg-red-600" },
};

function Section({ icon, title, children, defaultOpen = true }: { icon: React.ReactNode; title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2 text-slate-700 font-semibold text-sm">
          <span className="text-teal-600">{icon}</span>
          {title}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && <div className="px-4 py-3 bg-white space-y-2">{children}</div>}
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
          <span className="w-1.5 h-1.5 rounded-full bg-teal-400 mt-2 flex-shrink-0" />
          <span className="leading-relaxed">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function textVal(v: string | Record<string, unknown> | undefined | null): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  return Object.entries(v).map(([k, val]) => `${k}: ${val}`).join("\n");
}

export default function AssessmentCard({ assessment, nutrition, newTasksCount }: Props) {
  const sev = assessment.severity;
  const sevCfg = sev ? severityConfig[sev] : null;

  const medicationText = textVal(assessment.medication_guidance);
  const doctorText = textVal(assessment.doctor_recommendation);

  return (
    <div className="rounded-2xl border-2 border-teal-200 bg-white shadow-md overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="bg-gradient-to-r from-teal-600 to-emerald-600 px-5 py-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-white font-bold text-base">Assessment Complete</h3>
              <p className="text-white/70 text-xs">Powered by Health Assessment AI</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {sevCfg && (
              <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${sevCfg.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${sevCfg.dot}`} />
                {sevCfg.label} Severity
              </span>
            )}
            {newTasksCount != null && newTasksCount > 0 && (
              <Badge className="bg-white/20 text-white border-white/30 text-[10px]">
                {newTasksCount} task{newTasksCount !== 1 ? "s" : ""} added
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Summary */}
        {assessment.summary && (
          <div className="bg-teal-50 border border-teal-100 rounded-xl px-4 py-3">
            <p className="text-sm text-teal-900 leading-relaxed">{assessment.summary}</p>
          </div>
        )}

        {/* Possible Causes */}
        {!!assessment.possible_causes?.length && (
          <Section icon={<Brain className="w-4 h-4" />} title="Possible Causes">
            <BulletList items={assessment.possible_causes} />
          </Section>
        )}

        {/* Recovery Suggestions */}
        {!!assessment.recovery_suggestions?.length && (
          <Section icon={<Stethoscope className="w-4 h-4" />} title="Recovery Suggestions">
            <BulletList items={assessment.recovery_suggestions} />
          </Section>
        )}

        {/* Food & Nutrition */}
        {(!!assessment.food_nutrition_recommendations?.length || nutrition) && (
          <Section icon={<Apple className="w-4 h-4" />} title="Food & Nutrition">
            {!!assessment.food_nutrition_recommendations?.length && (
              <>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Recommendations</p>
                <BulletList items={assessment.food_nutrition_recommendations} />
              </>
            )}
            {nutrition?.recommended_foods && nutrition.recommended_foods.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Foods to Include</p>
                <BulletList items={nutrition.recommended_foods} />
              </div>
            )}
            {nutrition?.foods_to_avoid && nutrition.foods_to_avoid.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Foods to Avoid</p>
                <BulletList items={nutrition.foods_to_avoid} />
              </div>
            )}
            {nutrition?.nutrition_tips && nutrition.nutrition_tips.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Nutrition Tips</p>
                <BulletList items={nutrition.nutrition_tips} />
              </div>
            )}
            {nutrition?.hydration_advice && (
              <p className="text-sm text-slate-600 mt-2 flex items-start gap-1.5">
                <Utensils className="w-3.5 h-3.5 text-teal-500 mt-0.5 flex-shrink-0" />
                {nutrition.hydration_advice}
              </p>
            )}
          </Section>
        )}

        {/* Medication Guidance */}
        {medicationText && (
          <Section icon={<Pill className="w-4 h-4" />} title="Medication Guidance">
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{medicationText}</p>
          </Section>
        )}

        {/* Doctor Recommendation */}
        {doctorText && (
          <Section icon={<Stethoscope className="w-4 h-4" />} title="Doctor Recommendation">
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{doctorText}</p>
          </Section>
        )}

        {/* Warning Signs */}
        {!!assessment.warning_signs?.length && (
          <Section icon={<AlertTriangle className="w-4 h-4" />} title="Warning Signs to Watch" defaultOpen={sev === "high" || sev === "emergency"}>
            <BulletList items={assessment.warning_signs} />
          </Section>
        )}

        {/* Nutrition meal plan detail */}
        {nutrition?.meal_plan && Object.keys(nutrition.meal_plan).length > 0 && (
          <Section icon={<Utensils className="w-4 h-4" />} title="Meal Plan" defaultOpen={false}>
            {Object.entries(nutrition.meal_plan).map(([meal, items]) => (
              <div key={meal}>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 capitalize">{meal}</p>
                <BulletList items={Array.isArray(items) ? items.map(String) : [String(items)]} />
              </div>
            ))}
          </Section>
        )}

        {/* See symptoms detail link */}
        <div className="flex items-center gap-2">
          <Eye className="w-3.5 h-3.5 text-slate-400" />
          <p className="text-xs text-slate-400 italic">
            This assessment is AI-generated and not a substitute for professional medical advice.
          </p>
        </div>
      </div>
    </div>
  );
}
