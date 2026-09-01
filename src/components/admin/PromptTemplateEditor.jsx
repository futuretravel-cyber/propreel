import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { DEFAULT_PROMPT_TEMPLATES, clearPromptCache } from "@/lib/promptRegistry";
import { Save, RotateCcw, Lock } from "lucide-react";

export default function PromptTemplateEditor({ settingId, onSaved }) {
  const { toast } = useToast();
  const [jsonText, setJsonText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    base44.entities.AppSetting.list().then((rows) => {
      const existing = rows?.[0];
      const templates = existing?.prompt_templates && typeof existing.prompt_templates === "object"
        ? { ...DEFAULT_PROMPT_TEMPLATES, ...existing.prompt_templates }
        : DEFAULT_PROMPT_TEMPLATES;
      setJsonText(JSON.stringify(templates, null, 2));
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      toast({ title: "Invalid JSON", description: "Please fix the JSON syntax errors before saving.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const data = { prompt_templates: parsed };
      let id = settingId;
      if (id) {
        await base44.entities.AppSetting.update(id, data);
      } else {
        const created = await base44.entities.AppSetting.create(data);
        id = created.id;
      }
      clearPromptCache();
      onSaved?.(id);
      toast({ title: "Prompt templates saved", description: "Registry cache refreshed." });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    }
    setSaving(false);
  };

  const handleReset = () => {
    setJsonText(JSON.stringify(DEFAULT_PROMPT_TEMPLATES, null, 2));
    toast({ title: "Reset to defaults", description: "Click Save to persist the default templates." });
  };

  if (loading) return null;

  return (
    <div className="border-t border-gray-100 pt-5 mt-5">
      <h4 className="text-xs font-bold text-[#0F082B] mb-1 flex items-center gap-2">
        <Lock className="w-3.5 h-3.5 text-[#21ABB5]" /> Admin Prompt Template Registry
      </h4>
      <p className="text-xs text-[#606060] mb-4">
        Master prompt templates and optimal denoiser strengths for every AI photo edit option. Admin-only — hidden from the agent interface. Edit the JSON below to override any template's <code className="text-purple-700">prompt</code> or <code className="text-purple-700">strength</code>.
      </p>
      <textarea
        value={jsonText}
        onChange={(e) => setJsonText(e.target.value)}
        rows={24}
        spellCheck={false}
        className="w-full font-mono text-xs border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-purple-700/30 resize-y bg-gray-50"
      />
      <div className="flex gap-2 mt-3">
        <Button onClick={handleSave} disabled={saving} size="sm" className="rounded-xl gap-2 bg-purple-700 hover:bg-purple-800">
          <Save className="w-3.5 h-3.5" /> {saving ? "Saving..." : "Save Templates"}
        </Button>
        <Button onClick={handleReset} variant="outline" size="sm" className="rounded-xl gap-2">
          <RotateCcw className="w-3.5 h-3.5" /> Reset to Defaults
        </Button>
      </div>
    </div>
  );
}