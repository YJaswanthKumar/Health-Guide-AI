import { useState } from "react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { UserCircle, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { getGetProfileQueryKey } from "@workspace/api-client-react";

type Props = {
  open: boolean;
  suggestions: Record<string, unknown>;
  onClose: () => void;
};

const FIELD_LABELS: Record<string, string> = {
  blood_group: "Blood Group",
  bloodGroup: "Blood Group",
  weight: "Weight (kg)",
  height: "Height (cm)",
  medical_conditions: "Medical Conditions",
  medicalConditions: "Medical Conditions",
  medications: "Medications",
  allergies: "Allergies",
  activity_level: "Activity Level",
  activityLevel: "Activity Level",
  sleep_hours: "Sleep Hours",
  sleepHours: "Sleep Hours",
  goals: "Health Goals",
};

function normalizeKey(key: string): string {
  return key
    .replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    .replace(/^([a-z])/, c => c.toLowerCase());
}

export default function ProfileUpdateDialog({ open, suggestions, onClose }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const updates: { label: string; value: string }[] = Object.entries(suggestions)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => ({
      label: FIELD_LABELS[k] ?? FIELD_LABELS[normalizeKey(k)] ?? k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      value: Array.isArray(v) ? (v as unknown[]).map(String).join(", ") : String(v),
    }));

  const handleConfirm = async () => {
    setSaving(true);
    try {
      // Normalize keys to camelCase for the API
      const payload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(suggestions)) {
        const normalized = normalizeKey(k);
        payload[normalized] = v;
      }

      const res = await fetch("/api/users/profile", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Update failed");

      queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
      setDone(true);
      toast({ title: "Profile updated", description: "Your health profile has been updated based on the assessment." });
      setTimeout(() => { setDone(false); onClose(); }, 1500);
    } catch {
      toast({ title: "Update failed", description: "Could not update your profile. Please update it manually.", variant: "destructive" });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <UserCircle className="w-5 h-5 text-teal-600" />
            Update Your Health Profile?
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3 pt-1" asChild>
            <div>
              <p className="text-sm text-slate-600">
                The AI assessment found information that could improve your health profile. Review the suggested changes below:
              </p>
              {updates.length > 0 && (
                <div className="mt-3 bg-teal-50 border border-teal-100 rounded-xl p-3 space-y-2">
                  {updates.map((u, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-teal-500 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-slate-700">{u.label}: </span>
                        <span className="text-xs text-slate-600 break-words">{u.value}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-slate-400 mt-2">
                You can always edit your profile manually from the Profile page.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel onClick={onClose} disabled={saving} className="order-last sm:order-first">
            Skip for Now
          </AlertDialogCancel>
          <Button
            onClick={handleConfirm}
            disabled={saving || done}
            className="bg-teal-600 hover:bg-teal-700 text-white gap-2"
          >
            {done ? (
              <><CheckCircle2 className="w-4 h-4" /> Updated!</>
            ) : saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
            ) : (
              <><ShieldCheck className="w-4 h-4" /> Yes, Update Profile</>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
