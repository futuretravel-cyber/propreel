import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { UserPlus } from "lucide-react";

export default function AddAgentForm({ agency, onAgentAdded }) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [creditsToAllocate, setCreditsToAllocate] = useState(0);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const allocated = Number(creditsToAllocate) || 0;
    if (!email.trim()) return;
    if (allocated > (agency.credits || 0)) {
      toast({ title: "Not enough credits in agency pool", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      await base44.entities.AgencyInvite.create({
        agency_id: agency.id,
        email: normalizedEmail,
        allocated_credits: allocated,
        status: "pending",
      });
      const updatedAgency = await base44.entities.Agency.update(agency.id, { credits: (agency.credits || 0) - allocated });
      await base44.users.inviteUser(normalizedEmail, "user");
      toast({ title: `Invite sent to ${normalizedEmail}` });
      setEmail("");
      setCreditsToAllocate(0);
      onAgentAdded(updatedAgency);
    } catch {
      toast({ title: "Failed to add agent", variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 p-6">
      <h3 className="font-bold text-[#0F082B] mb-1 flex items-center gap-2"><UserPlus className="w-4 h-4 text-purple-700" /> Add an Agent</h3>
      <p className="text-xs text-[#606060] mb-4">The agent will receive a login invite by email. Allocated credits are deducted from your agency pool immediately.</p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="agent@email.com" className="rounded-xl h-11 flex-1" />
        <Input type="number" min="0" value={creditsToAllocate} onChange={(e) => setCreditsToAllocate(e.target.value)} placeholder="Credits to allocate" className="rounded-xl h-11 sm:w-48" />
        <Button type="submit" disabled={saving} className="bg-purple-700 hover:bg-purple-800 text-white rounded-xl h-11 px-6 font-semibold whitespace-nowrap">
          {saving ? "Adding..." : "Add Agent"}
        </Button>
      </div>
    </form>
  );
}