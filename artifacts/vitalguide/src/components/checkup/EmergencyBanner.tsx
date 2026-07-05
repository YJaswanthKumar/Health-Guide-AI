import { AlertTriangle, Phone, MapPin, UserCheck, ChevronDown, ChevronUp, Siren } from "lucide-react";
import { useState } from "react";

export type EmergencyData = {
  first_aid_instructions?: string[];
  nearby_hospitals?: string[];
  recommended_specialists?: string[];
  emergency_contacts?: string[];
  immediate_actions?: string[];
  disclaimer?: string;
};

type Props = {
  emergencyData: EmergencyData;
};

function CollapseSection({ title, icon, children, defaultOpen = true }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-red-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-red-50 hover:bg-red-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2 text-red-800 font-semibold text-sm">
          <span className="text-red-600">{icon}</span>
          {title}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-red-400" /> : <ChevronDown className="w-4 h-4 text-red-400" />}
      </button>
      {open && <div className="px-4 py-3 bg-white/80 space-y-1.5">{children}</div>}
    </div>
  );
}

function BulletList({ items, color = "bg-red-400" }: { items: string[]; color?: string }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
          <span className={`w-1.5 h-1.5 rounded-full ${color} mt-2 flex-shrink-0`} />
          <span className="leading-relaxed">{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function EmergencyBanner({ emergencyData }: Props) {
  const contacts = emergencyData.emergency_contacts?.length
    ? emergencyData.emergency_contacts
    : ["911 (US Emergency Services)", "Your local emergency number"];

  return (
    <div className="rounded-2xl border-2 border-red-400 bg-red-50 shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
      {/* Top alert bar */}
      <div className="bg-red-600 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0 animate-pulse">
            <Siren className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-white font-bold text-base">⚠️ Emergency Alert</h3>
            <p className="text-red-100 text-xs mt-0.5">
              Your symptoms indicate a possible medical emergency. Seek immediate care.
            </p>
          </div>
        </div>
      </div>

      {/* Emergency Call banner */}
      <div className="bg-red-50 border-b border-red-200 px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Phone className="w-5 h-5 text-red-600 flex-shrink-0" />
          <span className="text-red-900 font-bold text-sm">Call Emergency Services Now</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {contacts.slice(0, 2).map((c, i) => (
            <span key={i} className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-full font-semibold">{c}</span>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Immediate Actions */}
        {!!(emergencyData.immediate_actions?.length ?? emergencyData.first_aid_instructions?.length) && (
          <CollapseSection title="Immediate Actions" icon={<AlertTriangle className="w-4 h-4" />} defaultOpen>
            <BulletList items={emergencyData.immediate_actions ?? emergencyData.first_aid_instructions ?? []} />
          </CollapseSection>
        )}

        {/* First Aid */}
        {!!emergencyData.first_aid_instructions?.length && !!emergencyData.immediate_actions?.length && (
          <CollapseSection title="First Aid Instructions" icon={<AlertTriangle className="w-4 h-4" />} defaultOpen>
            <BulletList items={emergencyData.first_aid_instructions} />
          </CollapseSection>
        )}

        {/* Nearby Hospitals */}
        {!!emergencyData.nearby_hospitals?.length && (
          <CollapseSection title="Nearby Emergency Facilities" icon={<MapPin className="w-4 h-4" />} defaultOpen={false}>
            <BulletList items={emergencyData.nearby_hospitals} color="bg-red-400" />
          </CollapseSection>
        )}

        {/* Recommended Specialists */}
        {!!emergencyData.recommended_specialists?.length && (
          <CollapseSection title="Recommended Specialists" icon={<UserCheck className="w-4 h-4" />} defaultOpen={false}>
            <BulletList items={emergencyData.recommended_specialists} color="bg-orange-400" />
          </CollapseSection>
        )}

        {/* Disclaimer */}
        <div className="bg-red-100 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-xs text-red-700 leading-relaxed font-medium">
            {emergencyData.disclaimer ?? "⚠️ This is an AI-generated emergency response. Always prioritize calling emergency services (911 or your local equivalent) over following AI guidance. Only a medical professional can properly evaluate your condition."}
          </p>
        </div>
      </div>
    </div>
  );
}
