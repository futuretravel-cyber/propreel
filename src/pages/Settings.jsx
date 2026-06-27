import React, { useState, useEffect } from "react";
import { User, CreditCard, Bell, Zap, ExternalLink, Eye, EyeOff, Download } from "lucide-react";
import CreatomateTemplates from "@/components/studio/CreatomateTemplates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";

const tabs = [
  { key: "profile", label: "Profile", icon: User },
  { key: "integrations", label: "Integrations", icon: Zap },
  { key: "billing", label: "Billing", icon: CreditCard },
  { key: "notifications", label: "Notifications", icon: Bell },
];

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState("profile");
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState({ full_name: "", phone: "", company: "" });
  const [notifs, setNotifs] = useState({ video_ready: true, weekly_summary: false, product_updates: true });
  const [showKeys, setShowKeys] = useState({});
  const [keys, setKeys] = useState({
    elevenlabs: localStorage.getItem("elevenlabs_api_key") || "",
    heygen: localStorage.getItem("heygen_api_key") || "",
    creatomate: localStorage.getItem("creatomate_api_key") || "",
  });

  const saveKey = (service) => {
    localStorage.setItem(`${service}_api_key`, keys[service]);
    toast({ title: `${service.charAt(0).toUpperCase() + service.slice(1)} API key saved!` });
  };

  useEffect(() => {
    if (user) {
      setProfile({ full_name: user.full_name || "", phone: user.phone || "", company: user.company || "" });
    }
  }, [user]);

  const saveProfile = async () => {
    setSaving(true);
    try {
      await base44.auth.updateMe(profile);
      toast({ title: "Profile updated" });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-[#0F082B] mb-6">Settings</h1>

      <div className="flex gap-1 bg-white rounded-xl border border-gray-100 p-1 mb-6 w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? "bg-purple-50 text-purple-700" : "text-[#606060] hover:bg-gray-50"
            }`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "profile" && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 space-y-5">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center">
              <span className="text-xl font-bold text-purple-700">
                {user?.full_name?.split(" ").map((n) => n[0]).join("").slice(0, 2) || "U"}
              </span>
            </div>
            <Button variant="outline" size="sm" className="rounded-xl">Upload avatar</Button>
          </div>

          <div>
            <label className="text-sm font-medium text-[#0F082B] mb-1.5 block">Full name</label>
            <Input value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} className="rounded-xl h-11 max-w-sm" />
          </div>
          <div>
            <label className="text-sm font-medium text-[#0F082B] mb-1.5 block">Email</label>
            <Input value={user?.email || ""} disabled className="rounded-xl h-11 max-w-sm bg-gray-50" />
          </div>
          <div>
            <label className="text-sm font-medium text-[#0F082B] mb-1.5 block">Phone</label>
            <Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} placeholder="+27 82 123 4567" className="rounded-xl h-11 max-w-sm" />
          </div>
          <div>
            <label className="text-sm font-medium text-[#0F082B] mb-1.5 block">Agency / Company</label>
            <Input value={profile.company} onChange={(e) => setProfile({ ...profile, company: e.target.value })} placeholder="Smit Properties" className="rounded-xl h-11 max-w-sm" />
          </div>
          <Button onClick={saveProfile} disabled={saving} className="bg-purple-700 hover:bg-purple-800 text-white font-semibold rounded-xl h-11 px-6">
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </div>
      )}

      {tab === "integrations" && (
        <div className="space-y-4">
          {[
            {
              key: "elevenlabs",
              name: "ElevenLabs",
              desc: "Ultra-realistic AI voice narration for property videos. Free plan includes 10,000 chars/month.",
              link: "https://elevenlabs.io",
              linkLabel: "Get API key at elevenlabs.io",
              color: "#7c3aed",
            },
            {
              key: "heygen",
              name: "HeyGen",
              desc: "AI talking avatar videos — a virtual presenter reads your voiceover on screen.",
              link: "https://app.heygen.com/settings?nav=API",
              linkLabel: "Get API key at heygen.com",
              color: "#9333ea",
            },
            {
              key: "creatomate",
              name: "Creatomate",
              desc: "Programmatic video rendering — exports real downloadable .mp4 files from your photos and templates.",
              link: "https://creatomate.com",
              linkLabel: "Get API key at creatomate.com",
              color: "#f97316",
            },
          ].map(service => (
            <div key={service.key} className="bg-white rounded-2xl border border-gray-100 p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: service.color }}>
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-[#0F082B] text-sm">{service.name}</h3>
                  <p className="text-xs text-[#606060]">{service.desc}</p>
                </div>
                {keys[service.key] && (
                  <span className="ml-auto text-xs bg-emerald-100 text-emerald-700 font-semibold px-2.5 py-1 rounded-full">✓ Connected</span>
                )}
              </div>
              <a href={service.link} target="_blank" rel="noreferrer" className="text-xs text-purple-700 flex items-center gap-1 hover:underline mb-3">
                {service.linkLabel} <ExternalLink className="w-3 h-3" />
              </a>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showKeys[service.key] ? "text" : "password"}
                    value={keys[service.key]}
                    onChange={e => setKeys(k => ({ ...k, [service.key]: e.target.value }))}
                    placeholder={`Enter ${service.name} API key...`}
                    className="rounded-xl h-10 pr-10 text-sm"
                  />
                  <button
                    onClick={() => setShowKeys(s => ({ ...s, [service.key]: !s[service.key] }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showKeys[service.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <Button onClick={() => saveKey(service.key)} disabled={!keys[service.key]} className="bg-purple-700 hover:bg-purple-800 text-white rounded-xl px-5">
                  Save
                </Button>
              </div>
            </div>
          ))}

          {/* Creatomate Templates Download */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-xl bg-purple-700 flex items-center justify-center">
                <Download className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-[#0F082B] text-sm">Creatomate Video Templates</h3>
                <p className="text-xs text-[#606060]">Download all 22 JSON templates to import into Creatomate (11 styles × landscape + portrait)</p>
              </div>
            </div>
            <CreatomateTemplates />
          </div>
        </div>
      )}

      {tab === "billing" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-[#0F082B]">Current Plan</h3>
                <p className="text-sm text-[#606060]">Free — R0/month</p>
              </div>
              <Button className="bg-purple-700 hover:bg-purple-800 text-white rounded-xl font-semibold px-6">Upgrade</Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-2xl font-extrabold text-[#0F082B]">10</p>
                <p className="text-xs text-[#606060]">Credits remaining</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-2xl font-extrabold text-[#0F082B]">0</p>
                <p className="text-xs text-[#606060]">Rollover credits</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-semibold text-[#0F082B] mb-4">Payment History</h3>
            <div className="text-sm text-[#606060] text-center py-6">No payments yet</div>
          </div>
        </div>
      )}

      {tab === "notifications" && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 space-y-5">
          {[
            { key: "video_ready", label: "Email me when my video is ready" },
            { key: "weekly_summary", label: "Email me weekly usage summary" },
            { key: "product_updates", label: "Product updates and tips" },
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between py-2">
              <span className="text-sm text-[#0F082B]">{item.label}</span>
              <Switch
                checked={notifs[item.key]}
                onCheckedChange={(v) => setNotifs({ ...notifs, [item.key]: v })}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}