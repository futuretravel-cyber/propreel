import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Save, Server } from "lucide-react";
import PromptTemplateEditor from "@/components/admin/PromptTemplateEditor";

export default function AWSSettingsTab() {
  const { toast } = useToast();
  const [settingId, setSettingId] = useState(null);
  const [apiUrl, setApiUrl] = useState("");
  const [cdnUrl, setCdnUrl] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [s3Region, setS3Region] = useState("");
  const [s3BucketRaw, setS3BucketRaw] = useState("");
  const [s3BucketOutputs, setS3BucketOutputs] = useState("");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [xaiApiKey, setXaiApiKey] = useState("");
  const [falApiKey, setFalApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    base44.entities.AppSetting.list().then((rows) => {
      const existing = rows?.[0];
      if (existing) {
        setSettingId(existing.id);
        setApiUrl(existing.aws_render_api_url || "");
        setCdnUrl(existing.aws_cdn_base_url || "");
        setWebhookUrl(existing.aws_webhook_url || "");
        setWebhookSecret(existing.aws_webhook_secret || "");
        setS3Region(existing.aws_s3_region || "");
        setS3BucketRaw(existing.aws_s3_bucket_raw || "");
        setS3BucketOutputs(existing.aws_s3_bucket_outputs || "");
        setAccessKeyId(existing.aws_access_key_id || "");
        setSecretAccessKey(existing.aws_secret_access_key || "");
        setXaiApiKey(existing.xai_api_key || "");
        setFalApiKey(existing.fal_api_key || "");
      }
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = { aws_render_api_url: apiUrl, aws_cdn_base_url: cdnUrl, aws_webhook_url: webhookUrl, aws_webhook_secret: webhookSecret, aws_s3_region: s3Region, aws_s3_bucket_raw: s3BucketRaw, aws_s3_bucket_outputs: s3BucketOutputs, aws_access_key_id: accessKeyId, aws_secret_access_key: secretAccessKey, xai_api_key: xaiApiKey, fal_api_key: falApiKey };
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
          <Label htmlFor="aws_webhook_url" className="text-xs font-semibold text-[#0F082B]">AWS Webhook URL</Label>
          <Input
            id="aws_webhook_url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://xxxxx.execute-api.af-south-1.amazonaws.com/prod/api/webhook/base44"
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

      {/* S3 Storage Configuration */}
      <div className="border-t border-gray-100 pt-5 mt-5">
        <h4 className="text-xs font-bold text-[#0F082B] mb-1 flex items-center gap-2">
          <Server className="w-3.5 h-3.5 text-[#21ABB5]" /> S3 Storage Configuration
        </h4>
        <p className="text-xs text-[#606060] mb-4">Credentials and bucket assignments for direct-to-S3 file uploads.</p>
        <div className="space-y-4">
          <div>
            <Label htmlFor="aws_s3_region" className="text-xs font-semibold text-[#0F082B]">S3 Region</Label>
            <Input id="aws_s3_region" value={s3Region} onChange={(e) => setS3Region(e.target.value)} placeholder="af-south-1" className="mt-1.5 rounded-xl" />
          </div>
          <div>
            <Label htmlFor="aws_s3_bucket_raw" className="text-xs font-semibold text-[#0F082B]">Raw Assets Bucket</Label>
            <Input id="aws_s3_bucket_raw" value={s3BucketRaw} onChange={(e) => setS3BucketRaw(e.target.value)} placeholder="propreel-raw-assets" className="mt-1.5 rounded-xl" />
          </div>
          <div>
            <Label htmlFor="aws_s3_bucket_outputs" className="text-xs font-semibold text-[#0F082B]">Video Outputs Bucket</Label>
            <Input id="aws_s3_bucket_outputs" value={s3BucketOutputs} onChange={(e) => setS3BucketOutputs(e.target.value)} placeholder="propreel-video-outputs-sa" className="mt-1.5 rounded-xl" />
          </div>
          <div>
            <Label htmlFor="aws_access_key_id" className="text-xs font-semibold text-[#0F082B]">AWS Access Key ID</Label>
            <Input id="aws_access_key_id" value={accessKeyId} onChange={(e) => setAccessKeyId(e.target.value)} placeholder="AKIA..." className="mt-1.5 rounded-xl" />
          </div>
          <div>
            <Label htmlFor="aws_secret_access_key" className="text-xs font-semibold text-[#0F082B]">AWS Secret Access Key</Label>
            <Input id="aws_secret_access_key" type="password" value={secretAccessKey} onChange={(e) => setSecretAccessKey(e.target.value)} placeholder="Secret access key" className="mt-1.5 rounded-xl" />
          </div>
        </div>
      </div>

      {/* xAI Grok API Configuration */}
      <div className="border-t border-gray-100 pt-5 mt-5">
        <h4 className="text-xs font-bold text-[#0F082B] mb-1 flex items-center gap-2">
          <Server className="w-3.5 h-3.5 text-[#21ABB5]" /> xAI Grok Vision API
        </h4>
        <p className="text-xs text-[#606060] mb-4">API key for Grok Vision-powered AI generation (descriptions, social media, voiceover scripts).</p>
        <div>
          <Label htmlFor="xai_api_key" className="text-xs font-semibold text-[#0F082B]">xAI API Key</Label>
          <Input id="xai_api_key" type="password" value={xaiApiKey} onChange={(e) => setXaiApiKey(e.target.value)} placeholder="xai-..." className="mt-1.5 rounded-xl" />
        </div>
      </div>

      {/* Fal.ai API Configuration */}
      <div className="border-t border-gray-100 pt-5 mt-5">
        <h4 className="text-xs font-bold text-[#0F082B] mb-1 flex items-center gap-2">
          <Server className="w-3.5 h-3.5 text-[#21ABB5]" /> Fal.ai FLUX API
        </h4>
        <p className="text-xs text-[#606060] mb-4">API key for FLUX Dev image-to-image generation (AI Photo Editor, Virtual Staging, Furniture Removal, Twilight).</p>
        <div>
          <Label htmlFor="fal_api_key" className="text-xs font-semibold text-[#0F082B]">Fal.ai API Key</Label>
          <Input id="fal_api_key" type="password" value={falApiKey} onChange={(e) => setFalApiKey(e.target.value)} placeholder="fal-..." className="mt-1.5 rounded-xl" />
        </div>
      </div>

      <PromptTemplateEditor settingId={settingId} onSaved={setSettingId} />

      <Button onClick={handleSave} disabled={saving} className="mt-6 rounded-xl gap-2 bg-purple-700 hover:bg-purple-800">
        <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}