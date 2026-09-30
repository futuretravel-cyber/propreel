import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatZar } from '../lib/utils';
import { mockAgencyMembers } from '../lib/mockData';
import {
  Users, Plus, Shield, Zap, TrendingUp, Award, Mail, Settings,
  BarChart3, Target, Clock, CheckCircle2, XCircle, Crown, Edit3,
  Trash2, Send, ChevronRight, Gift, AlertCircle, Star, BookOpen,
  Building2, Trophy
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts';

// Extended member data
const members = [
  { id: 'usr_001', fullName: 'Sarah van der Merwe', email: 'sarah@demorealty.co.za', credits: 45, creditsSpent: 230, projectCount: 12, rendersCompleted: 28, avgRenderTime: '2.8 min', lastActive: '2 hours ago', role: 'Agent', limit: 200, avatar: 'SV' },
  { id: 'usr_002', fullName: 'James Molefe', email: 'james@demorealty.co.za', credits: 80, creditsSpent: 180, projectCount: 8, rendersCompleted: 15, avgRenderTime: '3.1 min', lastActive: '5 hours ago', role: 'Agent', limit: 200, avatar: 'JM' },
  { id: 'usr_003', fullName: 'Priya Naidoo', email: 'priya@demorealty.co.za', credits: 120, creditsSpent: 95, projectCount: 5, rendersCompleted: 8, avgRenderTime: '3.5 min', lastActive: '1 day ago', role: 'Agent', limit: 150, avatar: 'PN' },
  { id: 'usr_004', fullName: 'David Botha', email: 'david@demorealty.co.za', credits: 30, creditsSpent: 310, projectCount: 15, rendersCompleted: 35, avgRenderTime: '2.5 min', lastActive: '30 min ago', role: 'Agent', limit: 300, avatar: 'DB' },
];

// Team performance data
const performanceData = [
  { name: 'Sarah', renders: 28, credits: 230, efficiency: 92 },
  { name: 'James', renders: 15, credits: 180, efficiency: 78 },
  { name: 'Priya', renders: 8, credits: 95, efficiency: 85 },
  { name: 'David', renders: 35, credits: 310, efficiency: 95 },
];

const radarData = [
  { metric: 'Renders', Sarah: 80, James: 43, Priya: 23, David: 100 },
  { metric: 'Efficiency', Sarah: 92, James: 78, Priya: 85, David: 95 },
  { metric: 'Consistency', Sarah: 85, James: 70, Priya: 90, David: 88 },
  { metric: 'Quality', Sarah: 88, James: 82, Priya: 75, David: 92 },
  { metric: 'Speed', Sarah: 90, James: 75, Priya: 65, David: 95 },
];

export default function EnhancedAgency() {
  const { user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<'overview' | 'members' | 'allocation' | 'onboarding' | 'settings'>('overview');
  const [inviteEmail, setInviteEmail] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [editingLimit, setEditingLimit] = useState<string | null>(null);
  const [newLimit, setNewLimit] = useState(0);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [agencySettings, setAgencySettings] = useState({
    agencyName: user?.agencyName || 'Demo Realty SA',
    maxAgents: 10,
    defaultCreditLimit: 200,
    autoInvite: false,
    emailNotifications: true,
    branding: {
      logo: '',
      primaryColor: '#800080',
      secondaryColor: '#9333ea'
    }
  });

  const totalPool = 4200;
  const totalSpent = members.reduce((sum, m) => sum + m.creditsSpent, 0);
  const totalMembers = members.length;

  const onboardingSteps = [
    { title: 'Welcome to Your Agency Dashboard', description: 'Manage your team, track performance, and allocate credits efficiently.', icon: '👋' },
    { title: 'Invite Your Team', description: 'Add agents to your agency. They\'ll share the credit pool and you can track their usage.', icon: '📧' },
    { title: 'Set Credit Limits', description: 'Control spending by setting monthly credit limits per team member.', icon: '🎯' },
    { title: 'Monitor Performance', description: 'View team analytics, compare efficiency, and identify top performers.', icon: '📊' },
    { title: 'Share Templates', description: 'Create agency-wide project templates and presets for consistent branding.', icon: '📋' },
    { title: 'You\'re All Set!', description: 'Your agency is ready. Start creating stunning property videos together!', icon: '🚀' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Building2 className="w-6 h-6 text-purple-400" /> Agency Dashboard
          </h1>
          <p className="text-ink-400 mt-1">Demo Realty SA • {totalMembers} members</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowInvite(true)} className="btn btn-primary text-sm"><Plus className="w-4 h-4" /> Invite Agent</button>
          <button onClick={() => setTab('settings' as any)} className="btn btn-secondary text-sm"><Settings className="w-4 h-4" /> Settings</button>
        </div>
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className="card-dark p-6 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white flex items-center gap-2"><Mail className="w-4 h-4 text-purple-400" /> Invite Team Member</h3>
            <button onClick={() => setShowInvite(false)} className="text-ink-400 hover:text-white">✕</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="label">Email Address</label><input className="input" placeholder="agent@agency.co.za" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} /></div>
            <div><label className="label">Full Name (optional)</label><input className="input" placeholder="John Smith" /></div>
            <div><label className="label">Role</label>
              <select className="input"><option>Agent</option><option>Admin</option><option>Viewer</option></select>
            </div>
            <div><label className="label">Monthly Credit Limit</label><input type="number" className="input" defaultValue={200} /></div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => { toast.success(`Invitation sent to ${inviteEmail || 'agent'}`, 'Invite Sent!'); setShowInvite(false); }} className="btn btn-primary"><Send className="w-4 h-4" /> Send Invitation</button>
            <button onClick={() => setShowInvite(false)} className="btn btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {[
          { id: 'overview', label: 'Overview', icon: <BarChart3 className="w-4 h-4" /> },
          { id: 'members', label: 'Team Members', icon: <Users className="w-4 h-4" /> },
          { id: 'allocation', label: 'Credit Allocation', icon: <Zap className="w-4 h-4" /> },
          { id: 'onboarding', label: 'Setup Guide', icon: <BookOpen className="w-4 h-4" /> },
          { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)} className={`flex items-center gap-2 tab-pill ${tab === t.id ? 'tab-pill-active' : ''}`}>
            {t.icon} <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ─── Overview Tab ──────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card-dark p-5">
              <p className="text-sm text-ink-400">Credit Pool</p>
              <p className="text-3xl font-bold text-white mt-1">{totalPool.toLocaleString()}</p>
              <div className="mt-2 h-2 bg-ink-700 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-purple-600 to-purple-400 rounded-full" style={{ width: `${((totalPool - totalSpent) / totalPool) * 100}%` }} />
              </div>
              <p className="text-xs text-ink-400 mt-1">{totalPool - totalSpent} remaining</p>
            </div>
            <div className="card-dark p-5">
              <p className="text-sm text-ink-400">Active Members</p>
              <p className="text-3xl font-bold text-white mt-1">{totalMembers}</p>
              <p className="text-xs text-ink-400 mt-2">of 25 seats used</p>
            </div>
            <div className="card-dark p-5">
              <p className="text-sm text-ink-400">Total Renders (30d)</p>
              <p className="text-3xl font-bold text-white mt-1">86</p>
              <p className="text-xs text-green-400 mt-2 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> +23% vs last month</p>
            </div>
            <div className="card-dark p-5">
              <p className="text-sm text-ink-400">Team Efficiency</p>
              <p className="text-3xl font-bold text-purple-400 mt-1">87%</p>
              <p className="text-xs text-ink-400 mt-2">credits per video quality</p>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card-dark p-6">
              <h3 className="font-semibold text-white mb-4">Team Performance</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={performanceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" stroke="#7f8aab" fontSize={12} />
                  <YAxis stroke="#7f8aab" fontSize={12} />
                  <Tooltip contentStyle={{ background: '#1e2338', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }} />
                  <Bar dataKey="renders" fill="#800080" radius={[4, 4, 0, 0]} name="Renders" />
                  <Bar dataKey="efficiency" fill="#22c55e" radius={[4, 4, 0, 0]} name="Efficiency %" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card-dark p-6">
              <h3 className="font-semibold text-white mb-4">Team Comparison</h3>
              <ResponsiveContainer width="100%" height={250}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="rgba(255,255,255,0.1)" />
                  <PolarAngleAxis dataKey="metric" stroke="#7f8aab" fontSize={11} />
                  <PolarRadiusAxis stroke="#7f8aab" fontSize={10} />
                  <Radar name="Sarah" dataKey="Sarah" stroke="#800080" fill="#800080" fillOpacity={0.2} />
                  <Radar name="David" dataKey="David" stroke="#22c55e" fill="#22c55e" fillOpacity={0.1} />
                  <Tooltip contentStyle={{ background: '#1e2338', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Leaderboard */}
          <div className="card-dark p-6">
            <h3 className="font-semibold text-white mb-4 flex items-center gap-2"><Trophy className="w-4 h-4 text-yellow-400" /> Team Leaderboard (This Month)</h3>
            <div className="space-y-3">
              {[...members].sort((a, b) => b.rendersCompleted - a.rendersCompleted).map((m, i) => (
                <div key={m.id} className="flex items-center gap-4 py-3 border-b border-white/5 last:border-0">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${i === 0 ? 'bg-yellow-500/20 text-yellow-400' : i === 1 ? 'bg-gray-400/20 text-gray-300' : i === 2 ? 'bg-orange-500/20 text-orange-400' : 'bg-ink-800 text-ink-400'}`}>
                    {i + 1}
                  </span>
                  <div className="w-10 h-10 rounded-full bg-purple-700/30 flex items-center justify-center text-purple-300 font-bold text-sm">{m.avatar}</div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{m.fullName}</p>
                    <p className="text-xs text-ink-400">{m.rendersCompleted} renders • {m.creditsSpent} credits</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-purple-400">{Math.round((m.rendersCompleted / 35) * 100)}%</p>
                    <p className="text-xs text-ink-500">of target</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Members Tab ───────────────────────────────────────────────────── */}
      {tab === 'members' && (
        <div className="space-y-4">
          <div className="card-dark overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Member</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Credits</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Renders</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Avg Time</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Last Active</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-purple-700/30 flex items-center justify-center text-purple-300 font-bold text-sm">{m.avatar}</div>
                        <div>
                          <p className="text-sm font-medium text-white">{m.fullName}</p>
                          <p className="text-xs text-ink-400">{m.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><span className="badge badge-muted">{m.role}</span></td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-white">{m.credits} remaining</p>
                      <p className="text-xs text-ink-400">{m.creditsSpent} spent</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-white">{m.rendersCompleted}</td>
                    <td className="px-4 py-3 text-sm text-ink-300">{m.avgRenderTime}</td>
                    <td className="px-4 py-3 text-sm text-ink-400">{m.lastActive}</td>
                    <td className="px-4 py-3"><button className="text-ink-400 hover:text-white"><Settings className="w-4 h-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Credit Allocation Tab ─────────────────────────────────────────── */}
      {tab === 'allocation' && (
        <div className="space-y-6">
          <div className="card-dark p-6">
            <h3 className="font-semibold text-white mb-4">Set Credit Limits per Member</h3>
            <p className="text-ink-400 text-sm mb-6">Control monthly spending by setting credit limits. Members cannot exceed their limit.</p>
            <div className="space-y-4">
              {members.map(m => (
                <div key={m.id} className="flex items-center gap-4 p-4 bg-ink-800/50 rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-purple-700/30 flex items-center justify-center text-purple-300 font-bold text-sm">{m.avatar}</div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{m.fullName}</p>
                    <p className="text-xs text-ink-400">{m.creditsSpent} / {m.limit} credits used this month</p>
                    <div className="mt-1 h-2 bg-ink-700 rounded-full overflow-hidden max-w-[200px]">
                      <div className={`h-full rounded-full ${(m.creditsSpent / m.limit) > 0.9 ? 'bg-red-500' : (m.creditsSpent / m.limit) > 0.7 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${Math.min(100, (m.creditsSpent / m.limit) * 100)}%` }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-ink-400">Limit:</span>
                    {editingLimit === m.id ? (
                      <div className="flex items-center gap-2">
                        <input type="number" className="input w-24 text-sm" value={newLimit} onChange={e => setNewLimit(Number(e.target.value))} />
                        <button onClick={() => { toast.success(`Limit updated for ${m.fullName}`); setEditingLimit(null); }} className="text-green-400 text-sm"><CheckCircle2 className="w-4 h-4" /></button>
                        <button onClick={() => setEditingLimit(null)} className="text-red-400 text-sm"><XCircle className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditingLimit(m.id); setNewLimit(m.limit); }} className="text-sm text-purple-400 font-semibold">{m.limit} credits <Edit3 className="w-3 h-3 inline" /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pool Usage Breakdown */}
          <div className="card-dark p-6">
            <h3 className="font-semibold text-white mb-4">Pool Usage Breakdown</h3>
            <div className="space-y-3">
              {members.map(m => {
                const pct = (m.creditsSpent / totalSpent) * 100;
                return (
                  <div key={m.id} className="flex items-center gap-4">
                    <div className="w-24 text-sm text-white truncate">{m.fullName.split(' ')[0]}</div>
                    <div className="flex-1 h-4 bg-ink-700 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-purple-600 to-purple-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-sm text-ink-300 w-16 text-right">{m.creditsSpent} cr</span>
                    <span className="text-xs text-ink-500 w-12 text-right">{pct.toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── Onboarding Tab ────────────────────────────────────────────────── */}
      {tab === 'onboarding' && (
        <div className="space-y-6">
          <div className="card-dark p-6">
            <h3 className="font-semibold text-white mb-2">Agency Setup Guide</h3>
            <p className="text-ink-400 text-sm mb-6">Follow these steps to get your agency up and running.</p>
            
            {/* Progress */}
            <div className="flex items-center gap-2 mb-8">
              {onboardingSteps.map((_, i) => (
                <div key={i} className="flex-1">
                  <div className={`h-2 rounded-full ${i <= onboardingStep ? 'bg-purple-600' : 'bg-ink-700'}`} />
                </div>
              ))}
            </div>

            {/* Current Step */}
            <div className="text-center py-8">
              <span className="text-5xl">{onboardingSteps[onboardingStep].icon}</span>
              <h4 className="text-xl font-bold text-white mt-4">{onboardingSteps[onboardingStep].title}</h4>
              <p className="text-ink-400 mt-2 max-w-md mx-auto">{onboardingSteps[onboardingStep].description}</p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-center gap-4">
              {onboardingStep > 0 && (
                <button onClick={() => setOnboardingStep(s => s - 1)} className="btn btn-secondary">← Previous</button>
              )}
              {onboardingStep < onboardingSteps.length - 1 ? (
                <button onClick={() => setOnboardingStep(s => s + 1)} className="btn btn-primary">Next Step →</button>
              ) : (
                <button onClick={() => { toast.success('Agency setup complete!'); setTab('overview'); }} className="btn btn-primary">Finish Setup 🎉</button>
              )}
            </div>

            {/* Steps List */}
            <div className="mt-8 space-y-2">
              {onboardingSteps.map((step, i) => (
                <div key={i} className={`flex items-center gap-3 p-3 rounded-lg ${i === onboardingStep ? 'bg-purple-950/30 border border-purple-500/20' : i < onboardingStep ? 'opacity-60' : 'opacity-40'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${i < onboardingStep ? 'bg-green-500/20 text-green-400' : i === onboardingStep ? 'bg-purple-700/30 text-purple-300' : 'bg-ink-800 text-ink-500'}`}>
                    {i < onboardingStep ? <CheckCircle2 className="w-4 h-4" /> : step.icon}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{step.title}</p>
                    <p className="text-xs text-ink-400">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sample Projects */}
          <div className="card-dark p-6">
            <h3 className="font-semibold text-white mb-4">Sample Projects for Learning</h3>
            <p className="text-ink-400 text-sm mb-4">Try these sample projects to learn the platform.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { title: 'Enhance a Photo', desc: 'Try the AI Photo Editor with Golden Sunset preset', icon: '📸' },
                { title: 'Create a Social Caption', desc: 'Generate an Instagram caption for a property', icon: '📱' },
                { title: 'Generate a Video Reel', desc: 'Create your first cinematic property video', icon: '🎬' },
              ].map((s, i) => (
                <button key={i} className="p-4 rounded-xl bg-ink-800/50 hover:bg-ink-800 text-left transition">
                  <span className="text-2xl">{s.icon}</span>
                  <p className="font-medium text-white mt-2 text-sm">{s.title}</p>
                  <p className="text-xs text-ink-400 mt-1">{s.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Settings Tab ──────────────────────────────────────────────────── */}
      {tab === 'settings' && (
        <div className="space-y-6">
          <div className="card-dark p-6">
            <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5 text-purple-400" /> Agency Settings
            </h3>
            
            <div className="space-y-6">
              {/* General Settings */}
              <div>
                <h4 className="text-sm font-medium text-white mb-3">General</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Agency Name</label>
                    <input 
                      type="text" 
                      className="input" 
                      value={agencySettings.agencyName}
                      onChange={(e) => setAgencySettings({...agencySettings, agencyName: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="label">Maximum Agents</label>
                    <input 
                      type="number" 
                      className="input" 
                      value={agencySettings.maxAgents}
                      onChange={(e) => setAgencySettings({...agencySettings, maxAgents: parseInt(e.target.value)})}
                      min={1}
                      max={10}
                    />
                    <p className="text-xs text-ink-500 mt-1">Maximum 10 agents per agency</p>
                  </div>
                  <div>
                    <label className="label">Default Credit Limit per Agent</label>
                    <input 
                      type="number" 
                      className="input" 
                      value={agencySettings.defaultCreditLimit}
                      onChange={(e) => setAgencySettings({...agencySettings, defaultCreditLimit: parseInt(e.target.value)})}
                      min={50}
                      max={1000}
                    />
                  </div>
                </div>
              </div>

              {/* Notification Settings */}
              <div className="border-t border-white/5 pt-6">
                <h4 className="text-sm font-medium text-white mb-3">Notifications</h4>
                <div className="space-y-3">
                  <label className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-white">Email Notifications</p>
                      <p className="text-xs text-ink-400">Receive email updates for team activity</p>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={agencySettings.emailNotifications}
                      onChange={(e) => setAgencySettings({...agencySettings, emailNotifications: e.target.checked})}
                      className="w-4 h-4 rounded"
                    />
                  </label>
                  <label className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-white">Auto-Invite New Members</p>
                      <p className="text-xs text-ink-400">Automatically send invites when adding members</p>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={agencySettings.autoInvite}
                      onChange={(e) => setAgencySettings({...agencySettings, autoInvite: e.target.checked})}
                      className="w-4 h-4 rounded"
                    />
                  </label>
                </div>
              </div>

              {/* Branding Settings */}
              <div className="border-t border-white/5 pt-6">
                <h4 className="text-sm font-medium text-white mb-3">Branding</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Agency Logo URL</label>
                    <input 
                      type="url" 
                      className="input" 
                      placeholder="https://example.com/logo.png"
                      value={agencySettings.branding.logo}
                      onChange={(e) => setAgencySettings({...agencySettings, branding: {...agencySettings.branding, logo: e.target.value}})}
                    />
                  </div>
                  <div>
                    <label className="label">Primary Color</label>
                    <div className="flex gap-2">
                      <input 
                        type="color" 
                        value={agencySettings.branding.primaryColor}
                        onChange={(e) => setAgencySettings({...agencySettings, branding: {...agencySettings.branding, primaryColor: e.target.value}})}
                        className="w-12 h-10 rounded cursor-pointer"
                      />
                      <input 
                        type="text" 
                        className="input flex-1" 
                        value={agencySettings.branding.primaryColor}
                        onChange={(e) => setAgencySettings({...agencySettings, branding: {...agencySettings.branding, primaryColor: e.target.value}})}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label">Secondary Color</label>
                    <div className="flex gap-2">
                      <input 
                        type="color" 
                        value={agencySettings.branding.secondaryColor}
                        onChange={(e) => setAgencySettings({...agencySettings, branding: {...agencySettings.branding, secondaryColor: e.target.value}})}
                        className="w-12 h-10 rounded cursor-pointer"
                      />
                      <input 
                        type="text" 
                        className="input flex-1" 
                        value={agencySettings.branding.secondaryColor}
                        onChange={(e) => setAgencySettings({...agencySettings, branding: {...agencySettings.branding, secondaryColor: e.target.value}})}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div className="border-t border-white/5 pt-6">
                <button 
                  onClick={() => {
                    toast.success('Agency settings saved successfully', 'Settings Updated');
                  }}
                  className="btn btn-primary"
                >
                  <CheckCircle2 className="w-4 h-4" /> Save Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


