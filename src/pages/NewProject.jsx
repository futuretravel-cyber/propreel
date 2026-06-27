import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

export default function NewProject() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [projectName, setProjectName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!projectName.trim()) return;
    setLoading(true);
    try {
      const p = await base44.entities.Project.create({ name: projectName, status: "draft" });
      navigate(`/projects/${p.id}/studio`);
    } catch {
      toast({ title: "Failed to create project", variant: "destructive" });
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto mt-16">
      <div className="bg-white rounded-2xl border border-gray-100 p-8">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Create a New Video</h2>
        <p className="text-sm text-gray-500 mb-6">Enter the property address or a name for your project.</p>
        <label className="text-sm font-medium text-gray-900 mb-1.5 block">Project name</label>
        <Input
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder="e.g. 12 Clifton Road, Cape Town"
          className="rounded-xl h-11 mb-4"
          autoFocus
        />
        <Button
          onClick={handleCreate}
          disabled={!projectName.trim() || loading}
          className="bg-purple-700 hover:bg-purple-800 text-white font-semibold rounded-xl h-11 px-6 gap-2"
        >
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</> : <>Open Studio <ArrowRight className="w-4 h-4" /></>}
        </Button>
      </div>
    </div>
  );
}