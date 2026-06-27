import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const navLinks = [
  { label: "Features", href: "/#features" },
  { label: "Pricing", href: "/pricing" },
  { label: "Reviews", href: "/reviews" },
  { label: "FAQ", href: "/#faq" },
  { label: "Contact", href: "/contact" },
];

export default function PublicNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-white/80 backdrop-blur-xl shadow-sm border-b border-gray-100"
            : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-18">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-purple-700 flex items-center justify-center">
                <span className="text-white font-bold text-sm">PR</span>
              </div>
              <span className="font-bold text-lg text-[#0F082B]">PropReel</span>
              <span className="text-[10px] font-semibold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">
                SA
              </span>
            </Link>

            <div className="hidden lg:flex items-center gap-8">
              {navLinks.map((l) => (
                <Link
                  key={l.label}
                  to={l.href}
                  className="text-sm font-medium text-[#606060] hover:text-[#0F082B] transition-colors"
                >
                  {l.label}
                </Link>
              ))}
            </div>

            <div className="hidden lg:flex items-center gap-3">
              <Link to="/login">
                <Button variant="ghost" className="text-sm font-medium text-[#0F082B]">
                  Log in
                </Button>
              </Link>
              <Link to="/register">
                <Button className="bg-purple-700 hover:bg-purple-800 text-white text-sm font-semibold px-5 rounded-xl">
                  Get started free
                </Button>
              </Link>
            </div>

            <button
              className="lg:hidden p-2 text-[#0F082B]"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="w-6 h-6" />
            </button>
          </div>
        </div>
      </nav>

      {mobileOpen && (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col">
          <div className="flex items-center justify-between px-4 h-16">
            <Link to="/" className="flex items-center gap-2.5" onClick={() => setMobileOpen(false)}>
              <div className="w-9 h-9 rounded-lg bg-purple-700 flex items-center justify-center">
                <span className="text-white font-bold text-sm">PR</span>
              </div>
              <span className="font-bold text-lg text-[#0F082B]">PropReel</span>
              <span className="text-[10px] font-semibold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">SA</span>
            </Link>
            <button onClick={() => setMobileOpen(false)} className="p-2">
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className="flex flex-col gap-1 px-4 mt-8">
            {navLinks.map((l) => (
              <Link
                key={l.label}
                to={l.href}
                className="text-lg font-medium text-[#0F082B] py-3 border-b border-gray-100"
                onClick={() => setMobileOpen(false)}
              >
                {l.label}
              </Link>
            ))}
          </div>
          <div className="mt-auto p-4 flex flex-col gap-3">
            <Link to="/login" onClick={() => setMobileOpen(false)}>
              <Button variant="outline" className="w-full rounded-xl h-12 text-base">Log in</Button>
            </Link>
            <Link to="/register" onClick={() => setMobileOpen(false)}>
              <Button className="w-full bg-purple-700 hover:bg-purple-800 text-white rounded-xl h-12 text-base font-semibold">
                Get started free
              </Button>
            </Link>
          </div>
        </div>
      )}
    </>
  );
}