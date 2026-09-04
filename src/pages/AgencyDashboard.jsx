import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Coins, Building2, Users, TrendingUp, ArrowLeft, Wallet, BarChart3 } from "lucide-react";
import CreateAgencyForm from "@/components/agency/CreateAgencyForm";
import AddAgentForm from "@/components/agency/AddAgentForm";
import AgentsTable from "@/components/agency/AgentsTable";

export default function AgencyDashboard() {
  const { user, checkUserAuth } = useAuth();
  const [agency, setAgency] = useState(null);
  const [agents, setAgents] = useState([]);
  const [spendByAgent, setSpendByAgent] = useState({});
  const [projectsByAgent, setProjectsByAgent] = useState({});
  const [loading, setLoading] = useState(true);

  const loadAgency = useCallback(async () => {
    if (!user?.agency_id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [agencyRecord, agentUsers] = await Promise.all([
        base44.entities.Agency.get(user.agency_id),
        base44.entities.User.filter({ agency_id: user.agency_id }),
      ]);
      setAgency(agencyRecord);
      setAgents(agentUsers);

      const spend = {};
      const projCounts = {};
      await Promise.all(
        agentUsers.map(async (a) => {
          const projects = await base44.entities.Project.filter({ created_by_id: a.id });
          spend[a.id] = projects.reduce((sum, p) => sum + (p.credits_used || 0), 0);
          projCounts[a.id] = projects.length;
        })
      );
      setSpendByAgent(spend);
      setProjectsByAgent(projCounts);
    } catch {}
    setLoading(false);
  }, [user?.agency_id]);

  useEffect(() => {
    loadAgency();
  }, [loadAgency]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-4 border-slate-700 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user?.agency_id) {
    return (
      <div className="pt-8">
        <CreateAgencyForm
          onCreated={async () => {
            await checkUserAuth();
            loadAgency();
          }}
        />
      </div>
    );
  }

  if (user.agency_role !== "owner") {
    return (
      <div className="max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center mt-8">
        <Building2 className="w-10 h-10 text-indigo-400 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-white mb-1">You're part of an agency</h2>
        <p className="text-sm text-slate-400">Contact your agency admin to manage credits or team members.</p>
      </div>
    );
  }

  const totalSpend = Object.values(spendByAgent).reduce((a, b) => a + b, 0);
  const totalProjects = Object.values(projectsByAgent).reduce((a, b) => a + b, 0);
  const maxSpend = Math.max(...Object.values(spendByAgent), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">{agency.name}</h1>
          <p className="text-sm text-slate-400 mt-1">Agency dashboard — manage agents and track shared credit spending</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center mb-3 shadow-lg">
            <Coins className="w-4 h-4 text-white" />
          </div>
          <p className="text-2xl font-extrabold text-white">{(agency.credits || 0).toLocaleString("en-ZA")}</p>
          <p className="text-xs text-slate-400 mt-0.5">Pool credits remaining</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mb-3 shadow-lg">
            <Users className="w-4 h-4 text-white" />
          </div>
          <p className="text-2xl font-extrabold text-white">{agents.length}</p>
          <p className="text-xs text-slate-400 mt-0.5">Agents in agency</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center mb-3 shadow-lg">
            <TrendingUp className="w-4 h-4 text-white" />
          </div>
          <p className="text-2xl font-extrabold text-white">{totalSpend.toLocaleString("en-ZA")}</p>
          <p className="text-xs text-slate-400 mt-0.5">Total credits spent</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mb-3 shadow-lg">
            <BarChart3 className="w-4 h-4 text-white" />
          </div>
          <p className="text-2xl font-extrabold text-white">{totalProjects}</p>
          <p className="text-xs text-slate-400 mt-0.5">Projects created</p>
        </div>
      </div>

      {/* Top up banner */}
      <div className="flex items-center justify-between gap-4 bg-gradient-to-r from-slate-900 to-slate-800 border border-slate-800 rounded-2xl px-6 py-4">
        <div className="flex items-center gap-3">
          <Wallet className="w-5 h-5 text-amber-400" />
          <div>
            <p className="text-sm font-semibold text-white">{(agency.credits || 0).toLocaleString("en-ZA")} credits in the shared pool</p>
            <p className="text-xs text-slate-400 mt-0.5">All agents spend from this pool · Top up anytime</p>
          </div>
        </div>
        <a href="/billing">
          <button className="text-xs font-semibold text-indigo-300 bg-indigo-500/15 border border-indigo-500/30 rounded-xl px-4 py-2 hover:bg-indigo-500/25 transition-colors whitespace-nowrap">
            Top up credits →
          </button>
        </a>
      </div>

      {/* Add agent form */}
      <AddAgentForm agency={agency} onAgentAdded={(updatedAgency) => { setAgency(updatedAgency); loadAgency(); }} />

      {/* Spending breakdown */}
      {agents.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-indigo-400" /> Spending by Agent
          </h3>
          <p className="text-xs text-slate-500 mb-5">Credits spent from the shared pool by each agent</p>
          <div className="space-y-4">
            {agents.map((a) => {
              const spent = spendByAgent[a.id] || 0;
              const pct = maxSpend > 0 ? Math.round((spent / maxSpend) * 100) : 0;
              return (
                <div key={a.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                        {a.full_name?.[0]?.toUpperCase() || a.email?.[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-200 truncate">{a.full_name || "Pending signup"}</p>
                        <p className="text-xs text-slate-500 truncate">{a.email}</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-white">{spent.toLocaleString("en-ZA")} credits</p>
                      <p className="text-xs text-slate-500">{projectsByAgent[a.id] || 0} projects</p>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Agents table */}
      <AgentsTable agents={agents} spendByAgent={spendByAgent} projectsByAgent={projectsByAgent} />
    </div>
  );
}