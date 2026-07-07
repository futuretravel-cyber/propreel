import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Building2 } from "lucide-react";

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
      toast({ title: "Agency created!" });
      onCreated(agency);
    } catch {
      toast({ title: "Failed to create agency", variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <div className="max-w-md mx-auto bg-white rounded-2xl border border-gray-100 p-8 text-center">
      <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center mx-auto mb-4">
        <Building2 className="w-6 h-6 text-purple-700" />
      </div>
      <h2 className="text-lg font-bold text-[#0F082B] mb-1">Set up your agency</h2>
      <p className="text-sm text-[#606060] mb-5">Create an agency account to add agents and manage their credits from one pool.</p>
      <form onSubmit={handleCreate} className="space-y-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Agency / office name" className="rounded-xl h-11" />
        <Button type="submit" disabled={saving || !name.trim()} className="w-full bg-purple-700 hover:bg-purple-800 text-white rounded-xl h-11 font-semibold">
          {saving ? "Creating..." : "Create Agency"}
        </Button>
      </form>
    </div>
  );
}