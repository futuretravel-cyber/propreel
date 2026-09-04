import React from "react";
import { Users, Film } from "lucide-react";

export default function AgentsTable({ agents, spendByAgent, projectsByAgent }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="p-6 border-b border-slate-800">
        <h3 className="font-bold text-white flex items-center gap-2">
          <Users className="w-4 h-4 text-indigo-400" /> Agents ({agents.length})
        </h3>
      </div>
      {agents.length === 0 ? (
        <p className="text-sm text-slate-500 p-6">No agents added yet. Use the form above to invite your first agent.</p>
      ) : (
        <div className="divide-y divide-slate-800">
          {agents.map((a) => (
            <div key={a.id} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-800/40 transition-colors">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                {a.full_name?.[0]?.toUpperCase() || a.email?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{a.full_name || "Pending signup"}</p>
                <p className="text-xs text-slate-500 truncate">{a.email}</p>
              </div>
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400">
                <Film className="w-3.5 h-3.5" /> {projectsByAgent?.[a.id] || 0} projects
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-white">{(spendByAgent[a.id] || 0).toLocaleString("en-ZA")} credits</p>
                <p className="text-xs text-slate-500">spent from pool</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}