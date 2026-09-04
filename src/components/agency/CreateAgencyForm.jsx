import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Building2, Loader2 } from "lucide-react";

export default function CreateAgencyForm({ onCreated }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const agency = await base44.entities.Agency.create({ name: name.trim(), credits: 0 });
      await base44.auth.updateMe({ agency_id: agency.id, agency_role: "owner" });
      toast({ title: "Agency created!", description: "Subscribe to the Agency plan to add credits to your shared pool." });
      onCreated(agency);
    } catch {
      toast({ title: "Failed to create agency", variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <div className="max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
        <Building2 className="w-6 h-6 text-white" />
      </div>
      <h2 className="text-lg font-bold text-white mb-1">Set up your agency</h2>
      <p className="text-sm text-slate-400 mb-5">Create an agency account to add agents and manage credits from one shared pool. All agents spend from the same balance.</p>
      <form onSubmit={handleCreate} className="space-y-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Agency / office name"
          className="rounded-xl h-11 bg-slate-800/60 border-slate-700 text-slate-100 placeholder:text-slate-500"
        />
        <Button type="submit" disabled={saving || !name.trim()} className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white rounded-xl h-11 font-semibold gap-2">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</> : "Create Agency"}
        </Button>
      </form>
      <a href="/billing" className="inline-block mt-4 text-xs font-semibold text-indigo-400 hover:text-indigo-300">
        Subscribe to the Agency plan →
      </a>
    </div>
  );
}