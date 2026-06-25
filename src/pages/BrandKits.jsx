import React, { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Star, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

export default function BrandKits() {
  const { toast } = useToast();
  const [kits, setKits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", agent_name: "", email: "", phone: "", is_default: false });
  const [saving, setSaving] = useState(false);

  const load = () => {
    base44.entities.BrandKit.list("-created_date")
      .then(setKits)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", agent_name: "", email: "", phone: "", is_default: false });
    setModalOpen(true);
  };

  const openEdit = (kit) => {
    setEditing(kit);
    setForm({ name: kit.name, agent_name: kit.agent_name, email: kit.email || "", phone: kit.phone || "", is_default: kit.is_default || false });
    setModalOpen(true);
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
      toast({ title: editing ? "Brand kit updated" : "Brand kit created" });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    try {
      await base44.entities.BrandKit.delete(id);
      setKits((prev) => prev.filter((k) => k.id !== id));
      toast({ title: "Brand kit deleted" });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0F082B]">Brand Kits</h1>
          <p className="text-sm text-[#606060] mt-1">Save your branding once — auto-apply to every video.</p>
        </div>
        <Button onClick={openNew} className="bg-[#21ABB5] hover:bg-[#1a9da6] text-white font-semibold rounded-xl h-11 px-6 gap-2">
          <Plus className="w-4 h-4" /> New Brand Kit
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-[#21ABB5] rounded-full animate-spin" />
        </div>
      ) : kits.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#DEF5F7] flex items-center justify-center mx-auto mb-4">
            <Star className="w-8 h-8 text-[#21ABB5]" />
          </div>
          <h3 className="font-bold text-[#0F082B] mb-2">No brand kits yet</h3>
          <p className="text-sm text-[#606060] mb-6">Create a brand kit to auto-apply your branding to every video.</p>
          <Button onClick={openNew} className="bg-[#21ABB5] hover:bg-[#1a9da6] text-white font-semibold rounded-xl px-8 h-11 gap-2">
            <Plus className="w-4 h-4" /> Create Brand Kit
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {kits.map((kit) => (
            <div key={kit.id} className="bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-lg transition-all">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-[#DEF5F7] flex items-center justify-center">
                    <span className="text-sm font-bold text-[#21ABB5]">
                      {kit.agent_name?.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-[#0F082B] text-sm">{kit.name}</h3>
                    {kit.is_default && (
                      <span className="text-[10px] font-semibold bg-[#DEF5F7] text-[#21ABB5] px-2 py-0.5 rounded-full">Default</span>
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
            <DialogTitle>{editing ? "Edit Brand Kit" : "Create Brand Kit"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-sm font-medium text-[#0F082B] mb-1.5 block">Brand Kit name</label>
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
              <span className="text-sm text-[#0F082B]">Set as default brand kit</span>
              <Switch checked={form.is_default} onCheckedChange={(v) => setForm({ ...form, is_default: v })} />
            </div>

            <div className="bg-[#DEF5F7]/50 rounded-xl p-3">
              <p className="text-xs text-[#606060]">Your Brand Kit will be automatically applied to every new video when set as default.</p>
            </div>

            <Button
              onClick={handleSave}
              disabled={!form.name || !form.agent_name || saving}
              className="w-full bg-[#21ABB5] hover:bg-[#1a9da6] text-white font-semibold rounded-xl h-11"
            >
              {saving ? "Saving..." : "Save Brand Kit"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}