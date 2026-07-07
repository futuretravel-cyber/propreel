import React from "react";
import { Users } from "lucide-react";

export default function AgentsTable({ agents, spendByAgent }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="p-6 border-b border-gray-100">
        <h3 className="font-bold text-[#0F082B] flex items-center gap-2"><Users className="w-4 h-4 text-purple-700" /> Agents ({agents.length})</h3>
      </div>
      {agents.length === 0 ? (
        <p className="text-sm text-[#606060] p-6">No agents added yet.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {agents.map((a) => (
            <div key={a.id} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors">
              <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center text-xs font-bold text-purple-700 flex-shrink-0">
                {a.full_name?.[0]?.toUpperCase() || a.email?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#0F082B] truncate">{a.full_name || "Pending signup"}</p>
                <p className="text-xs text-[#606060] truncate">{a.email}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-[#0F082B]">{a.credits || 0} credits</p>
                <p className="text-xs text-[#606060]">{spendByAgent[a.id] || 0} spent</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}