import React from "react";
import { ToastAction } from "@/components/ui/toast";

// Shared "out of credits" toast with an upgrade prompt, used across all credit-consuming tools.
export function notifyOutOfCredits(toast, cost) {
  toast({
    title: "Out of credits",
    description: `This action costs ${cost} credit${cost !== 1 ? "s" : ""}. Upgrade your plan to keep going.`,
    variant: "destructive",
    action: (
      <ToastAction altText="Upgrade plan">
        <a
          href="/pricing"
          className="inline-block text-xs font-semibold px-3 py-1.5 rounded-lg bg-purple-700 text-white hover:bg-purple-800 whitespace-nowrap"
        >
          Upgrade
        </a>
      </ToastAction>
    ),
  });
}