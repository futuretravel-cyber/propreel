import React, { useState } from "react";
import { Mail, MessageCircle, Clock, HelpCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

export default function Contact() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", company: "", subject: "", message: "" });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await base44.entities.ContactSubmission.create(form);
      toast({ title: "Message sent!", description: "We'll get back to you within 24 hours." });
      setForm({ name: "", email: "", company: "", subject: "", message: "" });
    } catch (err) {
      toast({ title: "Something went wrong", description: "Please try again.", variant: "destructive" });
    }
    setLoading(false);
  };

  return (
    <div className="pt-28 pb-20 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[#0F082B] mb-4">Get in Touch</h1>
          <p className="text-lg text-[#606060]">Have a question? We'd love to hear from you.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
          <form onSubmit={handleSubmit} className="lg:col-span-3 bg-white border border-gray-100 rounded-2xl p-8 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-[#0F082B] mb-1.5 block">Full name</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Johan Smit"
                  required
                  className="rounded-xl h-11"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-[#0F082B] mb-1.5 block">Email</label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="johan@example.co.za"
                  required
                  className="rounded-xl h-11"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-[#0F082B] mb-1.5 block">Company (optional)</label>
              <Input
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                placeholder="Smit Properties"
                className="rounded-xl h-11"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[#0F082B] mb-1.5 block">Subject</label>
              <Select value={form.subject} onValueChange={(v) => setForm({ ...form, subject: v })}>
                <SelectTrigger className="rounded-xl h-11">
                  <SelectValue placeholder="Select a topic" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General enquiry</SelectItem>
                  <SelectItem value="pricing">Pricing & billing</SelectItem>
                  <SelectItem value="technical">Technical support</SelectItem>
                  <SelectItem value="partnership">Partnership opportunity</SelectItem>
                  <SelectItem value="feedback">Feedback</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-[#0F082B] mb-1.5 block">Message</label>
              <Textarea
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="Tell us how we can help..."
                rows={5}
                required
                className="rounded-xl"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="bg-[#21ABB5] hover:bg-[#1a9da6] text-white font-semibold h-12 rounded-xl px-8 gap-2"
            >
              {loading ? "Sending..." : <><Send className="w-4 h-4" /> Send message</>}
            </Button>
          </form>

          <div className="lg:col-span-2 space-y-4">
            {[
              { icon: Mail, title: "Email us", desc: "support@autoreelsa.co.za", sub: "We'll respond within 24 hours" },
              { icon: MessageCircle, title: "Live chat", desc: "Chat with our team", sub: "Available Mon-Fri, 8am-5pm" },
              { icon: Clock, title: "Business hours", desc: "Monday - Friday", sub: "08:00 - 17:00 SAST" },
              { icon: HelpCircle, title: "FAQ", desc: "Check our FAQ section", sub: "Answers to common questions" },
            ].map((item) => (
              <div key={item.title} className="bg-white border border-gray-100 rounded-2xl p-6 hover:shadow-md transition-all">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[#DEF5F7] flex items-center justify-center flex-shrink-0">
                    <item.icon className="w-5 h-5 text-[#21ABB5]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[#0F082B] text-sm">{item.title}</h3>
                    <p className="text-sm text-[#0F082B] mt-0.5">{item.desc}</p>
                    <p className="text-xs text-[#606060] mt-0.5">{item.sub}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}