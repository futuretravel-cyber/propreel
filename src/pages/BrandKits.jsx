import React, { useState, useEffect, useRef } from "react";
import { Plus, Pencil, Trash2, Star, Upload, User, Building2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { base44 } from "@/api/base44Client";
import { uploadToS3 } from "@/lib/awsS3";
import { useToast } from "@/components/ui/use-toast";

export default function BrandKits() {
  const { toast } = useToast();
  const [kits, setKits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", agent_name: "", email: "", phone: "", is_default: false, include_agent_branding: true, profile_photo_url: "", logo_url: "" });
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadTab, setUploadTab] = useState("info");
  const avatarInputRef = useRef();
  const logoInputRef = useRef();

  const load = () => {
    base44.entities.BrandKit.list("-created_date")
      .then(setKits)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", agent_name: "", email: "", phone: "", is_default: false, include_agent_branding: true, profile_photo_url: "", logo_url: "" });
    setUploadTab("info");
    setModalOpen(true);
  };

  const openEdit = (kit) => {
    setEditing(kit);
    setForm({
      name: kit.name,
      agent_name: kit.agent_name,
      email: kit.email || "",
      phone: kit.phone || "",
      is_default: kit.is_default || false,
      include_agent_branding: kit.include_agent_branding !== false,
      profile_photo_url: kit.profile_photo_url || "",
      logo_url: kit.logo_url || "",
    });
    setUploadTab("info");
    setModalOpen(true);
  };

  const handleUploadAvatar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploadingAvatar(true);
    try {
      const file_url = await uploadToS3(file, "headshots");
      setForm((f) => ({ ...f, profile_photo_url: file_url }));
      toast({ title: "Avatar uploaded" });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    }
    setUploadingAvatar(false);
  };

  const handleUploadLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploadingLogo(true);
    try {
      const file_url = await uploadToS3(file, "logos");
      setForm((f) => ({ ...f, logo_url: file_url }));
      toast({ title: "Logo uploaded" });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    }
    setUploadingLogo(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (form.is_default) {
        const defaults = kits.filter((k) => k.is_default && k.id !== editing?.id);
        for (const d of defaults) {
          await base44.entities.BrandKit.update(d.id, { is_default: false });
        }
      }
      if (editing) {
        await base44.entities.BrandKit.update(editing.id, form);
      } else {
        await base44.entities.BrandKit.create(form);
      }
      setModalOpen(false);
      load();
      toast({ title: editing ? "Agent profile updated" : "Agent profile created" });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    try {
      await base44.entities.BrandKit.delete(id);
      setKits((prev) => prev.filter((k) => k.id !== id));
      toast({ title: "Agent profile deleted" });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0F082B]">Agent Profile Branding</h1>
          <p className="text-sm text-[#606060] mt-1">Save your branding once — auto-apply to every video.</p>
        </div>
        <Button onClick={openNew} className="bg-purple-700 hover:bg-purple-800 text-white font-semibold rounded-xl h-11 px-6 gap-2">
          <Plus className="w-4 h-4" /> New Agent Profile
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-purple-700 rounded-full animate-spin" />
        </div>
      ) : kits.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-purple-50 flex items-center justify-center mx-auto mb-4">
          <Star className="w-8 h-8 text-purple-700" />
          </div>
          <h3 className="font-bold text-[#0F082B] mb-2">No agent profiles yet</h3>
          <p className="text-sm text-[#606060] mb-6">Create an agent profile to auto-apply your branding to every video.</p>
          <Button onClick={openNew} className="bg-purple-700 hover:bg-purple-800 text-white font-semibold rounded-xl px-8 h-11 gap-2">
            <Plus className="w-4 h-4" /> Create Agent Profile
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {kits.map((kit) => (
            <div key={kit.id} className="bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-lg transition-all">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  {kit.profile_photo_url ? (
                    <img src={kit.profile_photo_url} alt={kit.agent_name} className="w-12 h-12 rounded-full object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                      <span className="text-sm font-bold text-purple-700">
                        {kit.agent_name?.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </span>
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      {kit.logo_url && <img src={kit.logo_url} alt="logo" className="h-5 object-contain" />}
                      <h3 className="font-semibold text-[#0F082B] text-sm">{kit.name}</h3>
                    </div>
                    {kit.is_default && (
                      <span className="text-[10px] font-semibold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Default</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 text-sm text-[#606060] mb-4">
                <p>{kit.agent_name}</p>
                {kit.email && <p>{kit.email}</p>}
                {kit.phone && <p>{kit.phone}</p>}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => openEdit(kit)} className="rounded-lg gap-1.5 flex-1">
                  <Pencil className="w-3 h-3" /> Edit
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleDelete(kit.id)} className="rounded-lg text-red-500 hover:text-red-600 hover:bg-red-50">
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Agent Profile" : "Create Agent Profile"}</DialogTitle>
          </DialogHeader>

          {/* Tabs */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {[
              { key: "info", label: "Details" },
              { key: "avatar", label: "Agent Photo" },
              { key: "logo", label: "Company Logo" },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setUploadTab(t.key)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${uploadTab === t.key ? "bg-white text-[#0F082B] shadow-sm" : "text-[#606060]"}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {uploadTab === "info" && (
            <div className="space-y-4 mt-2">
              <div>
                <label className="text-sm font-medium text-[#0F082B] mb-1.5 block">Profile name</label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Smit Properties – Johan" className="rounded-xl h-10" />
              </div>
              <div>
                <label className="text-sm font-medium text-[#0F082B] mb-1.5 block">Agent full name</label>
                <Input value={form.agent_name} onChange={(e) => setForm({ ...form, agent_name: e.target.value })} placeholder="Johan Smit" className="rounded-xl h-10" />
              </div>
              <div>
                <label className="text-sm font-medium text-[#0F082B] mb-1.5 block">Email</label>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="johan@example.co.za" className="rounded-xl h-10" />
              </div>
              <div>
                <label className="text-sm font-medium text-[#0F082B] mb-1.5 block">Phone</label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+27 82 123 4567" className="rounded-xl h-10" />
              </div>
              <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                <span className="text-sm text-[#0F082B]">Set as default agent profile</span>
                <Switch checked={form.is_default} onCheckedChange={(v) => setForm({ ...form, is_default: v })} />
              </div>
              <div className="flex items-center justify-between bg-purple-50 border border-purple-100 rounded-xl p-4">
                <div>
                  <span className="text-sm font-semibold text-[#0F082B] block">Include Agent Branding in Video</span>
                  <span className="text-xs text-[#606060] mt-0.5 block">When enabled, your photo, logo, and contact details will appear in the final video output.</span>
                </div>
                <Switch checked={form.include_agent_branding} onCheckedChange={(v) => setForm({ ...form, include_agent_branding: v })} />
              </div>
            </div>
          )}

          {uploadTab === "avatar" && (
            <div className="mt-2 space-y-4">
              <p className="text-sm text-[#606060]">Upload a profile photo for the agent. This appears on the video outro card.</p>
              <div className="flex flex-col items-center gap-4">
                {form.profile_photo_url ? (
                  <div className="relative">
                    <img src={form.profile_photo_url} alt="avatar" className="w-28 h-28 rounded-full object-cover border-4 border-purple-100" />
                    <div className="absolute bottom-0 right-0 w-8 h-8 bg-purple-700 rounded-full flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  </div>
                ) : (
                  <div className="w-28 h-28 rounded-full bg-gray-100 flex items-center justify-center">
                    <User className="w-12 h-12 text-gray-300" />
                  </div>
                )}
                <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleUploadAvatar} />
                <Button
                  variant="outline"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="rounded-xl gap-2"
                >
                  <Upload className="w-4 h-4" />
                  {uploadingAvatar ? "Uploading..." : form.profile_photo_url ? "Change Photo" : "Upload Photo"}
                </Button>
              </div>
            </div>
          )}

          {uploadTab === "logo" && (
            <div className="mt-2 space-y-4">
              <p className="text-sm text-[#606060]">Upload your company or agency logo. It will appear in intros and outros.</p>
              <div className="flex flex-col items-center gap-4">
                {form.logo_url ? (
                  <div className="w-40 h-20 rounded-xl border border-gray-200 bg-white flex items-center justify-center p-3">
                    <img src={form.logo_url} alt="logo" className="max-w-full max-h-full object-contain" />
                  </div>
                ) : (
                  <div className="w-40 h-20 rounded-xl bg-gray-100 flex items-center justify-center">
                    <Building2 className="w-10 h-10 text-gray-300" />
                  </div>
                )}
                <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleUploadLogo} />
                <Button
                  variant="outline"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadingLogo}
                  className="rounded-xl gap-2"
                >
                  <Upload className="w-4 h-4" />
                  {uploadingLogo ? "Uploading..." : form.logo_url ? "Change Logo" : "Upload Logo"}
                </Button>
              </div>
            </div>
          )}

          <Button
            onClick={handleSave}
            disabled={!form.name || !form.agent_name || saving}
            className="w-full bg-purple-700 hover:bg-purple-800 text-white font-semibold rounded-xl h-11 mt-2"
          >
            {saving ? "Saving..." : "Save Agent Profile"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}