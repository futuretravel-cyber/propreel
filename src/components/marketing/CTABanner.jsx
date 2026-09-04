import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CTABanner() {
  return (
    <section className="px-4 pb-0">
      <div className="max-w-6xl mx-auto bg-[#0F082B] rounded-t-3xl p-12 sm:p-16 text-center">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-6">
          Create your AI property videos today
        </h2>
        <Link to="/register">
          <Button className="bg-purple-700 hover:bg-purple-800 text-white font-semibold px-10 h-14 rounded-xl text-lg gap-2">
            Get Started <ArrowRight className="w-5 h-5" />
          </Button>
        </Link>
        <p className="text-sm text-gray-400 mt-4">Priced in ZAR</p>
      </div>
    </section>
  );
}