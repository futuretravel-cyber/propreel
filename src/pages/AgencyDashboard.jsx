import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Coins, Building2 } from "lucide-react";
import CreateAgencyForm from "@/components/agency/CreateAgencyForm";
import AddAgentForm from "@/components/agency/AddAgentForm";
import AgentsTable from "@/components/agency/AgentsTable";

export default function AgencyDashboard() {
  const { user, checkUserAuth } = useAuth();
  const [agency, setAgency] = useState(null);
  const [agents, setAgents] = useState([]);
  const [spendByAgent, setSpendByAgent] = useState({});
  const [loading, setLoading] = useState(true);

  const loadAgency = useCallback(async () => {
    if (!user?.agency_id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [agencyRecord, agentUsers] = await Promise.all([
      base44.entities.Agency.get(user.agency_id),
      base44.entities.User.filter({ agency_id: user.agency_id }),
    ]);
    setAgency(agencyRecord);
    setAgents(agentUsers);

    const spend = {};
    await Promise.all(
      agentUsers.map(async (a) => {
        const projects = await base44.entities.Project.filter({ created_by_id: a.id });
        spend[a.id] = projects.reduce((sum, p) => sum + (p.credits_used || 0), 0);
      })
    );
    setSpendByAgent(spend);
    setLoading(false);
  }, [user?.agency_id]);

  useEffect(() => {
    loadAgency();
  }, [loadAgency]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-purple-700 rounded-full animate-spin" />
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
      <div className="max-w-md mx-auto bg-white rounded-2xl border border-gray-100 p-8 text-center mt-8">
        <Building2 className="w-10 h-10 text-purple-700 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-[#0F082B] mb-1">You're part of an agency</h2>
        <p className="text-sm text-[#606060]">Contact your agency admin to manage credits or team members.</p>
      </div>
    );
  }

  const totalSpend = Object.values(spendByAgent).reduce((a, b) => a + b, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#0F082B]">{agency.name}</h1>
          <p className="text-sm text-[#606060] mt-1">Agency dashboard — manage agents and shared credits</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center mb-3">
            <Coins className="w-4 h-4 text-purple-700" />
          </div>
          <p className="text-2xl font-extrabold text-[#0F082B]">{agency.credits || 0}</p>
          <p className="text-xs text-[#606060] mt-0.5">Agency pool credits</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-2xl font-extrabold text-[#0F082B]">{agents.length}</p>
          <p className="text-xs text-[#606060] mt-0.5">Agents in office</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-2xl font-extrabold text-[#0F082B]">{totalSpend}</p>
          <p className="text-xs text-[#606060] mt-0.5">Total credits spent</p>
        </div>
      </div>

      <div className="space-y-6">
        <AddAgentForm agency={agency} onAgentAdded={(updatedAgency) => { setAgency(updatedAgency); loadAgency(); }} />
        <AgentsTable agents={agents} spendByAgent={spendByAgent} />
      </div>
    </div>
  );
}