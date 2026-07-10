import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Save, Server } from "lucide-react";

export default function AWSSettingsTab() {
  const { toast } = useToast();
  const [settingId, setSettingId] = useState(null);
  const [apiUrl, setApiUrl] = useState("");
  const [cdnUrl, setCdnUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    base44.entities.AppSetting.list().then((rows) => {
      const existing = rows?.[0];
      if (existing) {
        setSettingId(existing.id);
        setApiUrl(existing.aws_render_api_url || "");
        setCdnUrl(existing.aws_cdn_base_url || "");
        setWebhookSecret(existing.aws_webhook_secret || "");
      }
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = { aws_render_api_url: apiUrl, aws_cdn_base_url: cdnUrl, aws_webhook_secret: webhookSecret };
      if (settingId) {
        await base44.entities.AppSetting.update(settingId, data);
      } else {
        const created = await base44.entities.AppSetting.create(data);
        setSettingId(created.id);
      }
      toast({ title: "AWS settings saved" });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-[#21ABB5] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 max-w-xl">
      <h3 className="font-bold text-[#0F082B] mb-1 flex items-center gap-2">
        <Server className="w-4 h-4 text-[#21ABB5]" /> AWS Render Pipeline
      </h3>
      <p className="text-xs text-[#606060] mb-6">Connection details for the external AWS render pipeline.</p>

      <div className="space-y-4">
        <div>
          <Label htmlFor="aws_render_api_url" className="text-xs font-semibold text-[#0F082B]">AWS Render API URL</Label>
          <Input
            id="aws_render_api_url"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="https://xxxxx.execute-api.us-east-1.amazonaws.com/prod/render"
            className="mt-1.5 rounded-xl"
          />
        </div>
        <div>
          <Label htmlFor="aws_cdn_base_url" className="text-xs font-semibold text-[#0F082B]">CDN Base URL</Label>
          <Input
            id="aws_cdn_base_url"
            value={cdnUrl}
            onChange={(e) => setCdnUrl(e.target.value)}
            placeholder="https://xxxxx.cloudfront.net"
            className="mt-1.5 rounded-xl"
          />
        </div>
        <div>
          <Label htmlFor="aws_webhook_secret" className="text-xs font-semibold text-[#0F082B]">AWS Webhook Secret</Label>
          <Input
            id="aws_webhook_secret"
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            placeholder="Shared secret for validating render-status callbacks"
            className="mt-1.5 rounded-xl"
          />
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} className="mt-6 rounded-xl gap-2 bg-purple-700 hover:bg-purple-800">
        <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}