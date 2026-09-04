import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { UserPlus, Loader2 } from "lucide-react";

export default function AddAgentForm({ agency, onAgentAdded }) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSaving(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      await base44.entities.AgencyInvite.create({
        agency_id: agency.id,
        email: normalizedEmail,
        allocated_credits: 0,
        status: "pending",
      });
      await base44.users.inviteUser(normalizedEmail, "user");
      toast({ title: `Invite sent to ${normalizedEmail}`, description: "The agent will receive a login invite by email. They'll spend from your shared agency pool." });
      setEmail("");
      setFullName("");
      onAgentAdded(agency);
    } catch {
      toast({ title: "Failed to add agent", variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
      <h3 className="font-bold text-white mb-1 flex items-center gap-2">
        <UserPlus className="w-4 h-4 text-indigo-400" /> Add an Agent
      </h3>
      <p className="text-xs text-slate-400 mb-4">The agent will receive a login invite by email. All agents spend from the shared agency credit pool — no individual allocation needed.</p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Agent full name (optional)"
          className="rounded-xl h-11 flex-1 bg-slate-800/60 border-slate-700 text-slate-100 placeholder:text-slate-500"
        />
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="agent@email.com"
          className="rounded-xl h-11 flex-1 bg-slate-800/60 border-slate-700 text-slate-100 placeholder:text-slate-500"
        />
        <Button type="submit" disabled={saving} className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl h-11 px-6 font-semibold whitespace-nowrap gap-2">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Adding...</> : "Add Agent"}
        </Button>
      </div>
    </form>
  );
}