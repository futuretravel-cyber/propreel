import React, { useState, useEffect } from "react";
import { User, CreditCard, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";

const tabs = [
  { key: "profile", label: "Profile", icon: User },
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