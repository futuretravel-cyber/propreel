import React from "react";
import { Link } from "react-router-dom";

const footerLinks = {
  "Who It's For": [
    { label: "Estate Agents", href: "/#who" },
    { label: "Property Photographers", href: "/#who" },
    { label: "Media Companies", href: "/#who" },
  ],
  Features: [
    { label: "Photo to Video", href: "/#features" },
    { label: "AI Virtual Staging", href: "/#features" },
    { label: "AI Photo Edits", href: "/#features" },
    { label: "AI Voiceovers", href: "/#features" },
    { label: "Studio Editor", href: "/#features" },
  ],
  Help: [
    { label: "FAQ", href: "/#faq" },
    { label: "Contact Us", href: "/contact" },
    { label: "Pricing", href: "/pricing" },
  ],
  Company: [
    { label: "About Us", href: "/about" },
    { label: "Reviews", href: "/reviews" },
    { label: "Privacy Policy", href: "#" },
    { label: "Terms of Service", href: "#" },
  ],
};

export default function Footer() {
  return (
    <footer className="bg-[#0F082B] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-lg bg-[#21ABB5] flex items-center justify-center">
                <span className="text-white font-bold text-sm">AR</span>
              </div>
              <span className="font-bold text-lg">AutoReel</span>
              <span className="text-[10px] font-semibold bg-[#21ABB5]/20 text-[#21ABB5] px-1.5 py-0.5 rounded-full">
                SA
              </span>
            </div>
            <p className="text-sm text-gray-400 mb-6 leading-relaxed">
              AI-powered property videos for the South African real estate market.
            </p>
            <div className="flex gap-3">
              {["Instagram", "LinkedIn", "Facebook", "TikTok"].map((s) => (
                <div
                  key={s}
                  className="w-9 h-9 rounded-lg bg-white/10 hover:bg-[#21ABB5]/30 flex items-center justify-center cursor-pointer transition-colors"
                >
                  <span className="text-xs font-medium text-gray-300">{s[0]}</span>
                </div>
              ))}
            </div>
          </div>

          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h4 className="font-semibold text-sm mb-4 text-white">{title}</h4>
              <ul className="space-y-2.5">
                {links.map((l) => (
                  <li key={l.label}>
                    <Link
                      to={l.href}
                      className="text-sm text-gray-400 hover:text-[#21ABB5] transition-colors"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row justify-between items-center gap-3">
          <p className="text-xs text-gray-500">
            © 2026 AutoReel SA. All rights reserved. | South African market.
          </p>
          <div className="flex gap-4">
            <Link to="#" className="text-xs text-gray-500 hover:text-gray-300">Privacy Policy</Link>
            <Link to="#" className="text-xs text-gray-500 hover:text-gray-300">Terms of Service</Link>
            <Link to="#" className="text-xs text-gray-500 hover:text-gray-300">Cookie Policy</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}