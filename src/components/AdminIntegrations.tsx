import { useState } from 'react';
import { MessageSquare, Headphones, Activity, FileText, Download, Mail, Bell, Upload, Check, X, Settings, Globe, Zap } from 'lucide-react';

export default function AdminIntegrations() {
  const [activeTab, setActiveTab] = useState('whatsapp');
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [liveChatEnabled, setLiveChatEnabled] = useState(false);
  const [statusPageEnabled, setStatusPageEnabled] = useState(false);
  const [reportsEnabled, setReportsEnabled] = useState(true);
  
  const [whatsappConfig, setWhatsappConfig] = useState({
    phoneNumber: '',
    businessName: 'PropReel',
    apiToken: '',
    webhookUrl: '',
    autoReply: true,
    businessHours: '09:00 - 17:00'
  });

  const [liveChatConfig, setLiveChatConfig] = useState({
    provider: 'crisp',
    appId: '',
    welcomeMessage: 'Hi! How can we help you today?',
    offlineMessage: 'We\'re currently offline. Leave a message and we\'ll get back to you.',
    showOnPages: ['all']
  });

  const [statusPageConfig, setStatusPageConfig] = useState({
    subdomain: 'status',
    customDomain: 'status.propreel.co.za',
    companyName: 'PropReel',
    logoUrl: '',
    supportEmail: 'support@propreel.co.za',
    showUptime: true,
    showIncidents: true
  });

  const [reportConfig, setReportConfig] = useState({
    autoGenerate: true,
    generateOnDay: 1,
    emailToAgents: true,
    customBranding: false,
    reportLogoUrl: '',
    reportHeader: 'PropReel Monthly Report',
    includeUsage: true,
    includeCredits: true,
    includeRenders: true,
    slackWebhook: '',
    emailWebhook: ''
  });

  const tabs = [
    { id: 'whatsapp', label: 'WhatsApp Business', icon: MessageSquare },
    { id: 'livechat', label: 'Live Chat', icon: Headphones },
    { id: 'status', label: 'Status Page', icon: Activity },
    { id: 'reports', label: 'Reports', icon: FileText }
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Settings className="w-6 h-6 text-purple-400" /> Integrations & Systems
        </h1>
        <p className="text-ink-400 mt-1">Configure external integrations and automated systems.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 tab-pill ${activeTab === tab.id ? 'tab-pill-active' : ''}`}
          >
            <tab.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* WhatsApp Business */}
      {activeTab === 'whatsapp' && (
        <div className="space-y-6">
          <div className="card-dark p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-green-400" /> WhatsApp Business API
                </h3>
                <p className="text-ink-400 text-sm mt-1">Enable WhatsApp notifications and customer support</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={whatsappEnabled}
                  onChange={(e) => setWhatsappEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-ink-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
              </label>
            </div>

            {whatsappEnabled && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Business Phone Number</label>
                    <input
                      type="tel"
                      className="input"
                      placeholder="+27 21 123 4567"
                      value={whatsappConfig.phoneNumber}
                      onChange={(e) => setWhatsappConfig({...whatsappConfig, phoneNumber: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="label">Business Name</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="PropReel"
                      value={whatsappConfig.businessName}
                      onChange={(e) => setWhatsappConfig({...whatsappConfig, businessName: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="label">API Token</label>
                    <input
                      type="password"
                      className="input"
                      placeholder="Enter WhatsApp Business API token"
                      value={whatsappConfig.apiToken}
                      onChange={(e) => setWhatsappConfig({...whatsappConfig, apiToken: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="label">Webhook URL</label>
                    <input
                      type="url"
                      className="input"
                      placeholder="https://propreel.co.za/api/whatsapp/webhook"
                      value={whatsappConfig.webhookUrl}
                      onChange={(e) => setWhatsappConfig({...whatsappConfig, webhookUrl: e.target.value})}
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Business Hours</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="09:00 - 17:00"
                    value={whatsappConfig.businessHours}
                    onChange={(e) => setWhatsappConfig({...whatsappConfig, businessHours: e.target.value})}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="autoReply"
                    checked={whatsappConfig.autoReply}
                    onChange={(e) => setWhatsappConfig({...whatsappConfig, autoReply: e.target.checked})}
                    className="w-4 h-4 rounded"
                  />
                  <label htmlFor="autoReply" className="text-sm text-ink-300">Enable automatic replies outside business hours</label>
                </div>

                <div className="flex gap-3 mt-6">
                  <button className="btn btn-primary">
                    <Check className="w-4 h-4" /> Save Configuration
                  </button>
                  <button className="btn btn-secondary">
                    Test Connection
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="card-dark p-6">
            <h4 className="font-semibold text-white mb-3">WhatsApp Message Templates</h4>
            <div className="space-y-3">
              <div className="bg-ink-800/50 rounded-lg p-4">
                <p className="text-sm text-white font-medium mb-1">Render Complete Notification</p>
                <p className="text-xs text-ink-400">{'"Hi {name}, your property video is ready! View it here: {video_url}"'}</p>
              </div>
              <div className="bg-ink-800/50 rounded-lg p-4">
                <p className="text-sm text-white font-medium mb-1">Low Credit Warning</p>
                <p className="text-xs text-ink-400">{'"Hi {name}, you have {credits} credits remaining. Top up here: {topup_url}"'}</p>
              </div>
              <div className="bg-ink-800/50 rounded-lg p-4">
                <p className="text-sm text-white font-medium mb-1">Monthly Report</p>
                <p className="text-xs text-ink-400">{'"Hi {name}, your monthly report is ready. You created {renders} videos this month!"'}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Live Chat */}
      {activeTab === 'livechat' && (
        <div className="space-y-6">
          <div className="card-dark p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Headphones className="w-5 h-5 text-blue-400" /> Live Chat Support
                </h3>
                <p className="text-ink-400 text-sm mt-1">Real-time customer support chat widget</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={liveChatEnabled}
                  onChange={(e) => setLiveChatEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-ink-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {liveChatEnabled && (
              <div className="space-y-4">
                <div>
                  <label className="label">Chat Provider</label>
                  <select
                    className="input"
                    value={liveChatConfig.provider}
                    onChange={(e) => setLiveChatConfig({...liveChatConfig, provider: e.target.value})}
                  >
                    <option value="crisp">Crisp</option>
                    <option value="intercom">Intercom</option>
                    <option value="tawk">Tawk.to</option>
                  </select>
                </div>

                <div>
                  <label className="label">App ID / Site ID</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Enter your chat provider app ID"
                    value={liveChatConfig.appId}
                    onChange={(e) => setLiveChatConfig({...liveChatConfig, appId: e.target.value})}
                  />
                </div>

                <div>
                  <label className="label">Welcome Message</label>
                  <textarea
                    className="input min-h-[80px]"
                    placeholder="Hi! How can we help you today?"
                    value={liveChatConfig.welcomeMessage}
                    onChange={(e) => setLiveChatConfig({...liveChatConfig, welcomeMessage: e.target.value})}
                  />
                </div>

                <div>
                  <label className="label">Offline Message</label>
                  <textarea
                    className="input min-h-[80px]"
                    placeholder="We're currently offline. Leave a message..."
                    value={liveChatConfig.offlineMessage}
                    onChange={(e) => setLiveChatConfig({...liveChatConfig, offlineMessage: e.target.value})}
                  />
                </div>

                <div>
                  <label className="label">Show Chat Widget On</label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" defaultChecked className="w-4 h-4 rounded" />
                      <span className="text-sm text-ink-300">All pages</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" className="w-4 h-4 rounded" />
                      <span className="text-sm text-ink-300">Dashboard only</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" className="w-4 h-4 rounded" />
                      <span className="text-sm text-ink-300">Pricing and signup pages</span>
                    </label>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button className="btn btn-primary">
                    <Check className="w-4 h-4" /> Save Configuration
                  </button>
                  <button className="btn btn-secondary">
                    Preview Widget
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Status Page */}
      {activeTab === 'status' && (
        <div className="space-y-6">
          <div className="card-dark p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Activity className="w-5 h-5 text-green-400" /> Status Page
                </h3>
                <p className="text-ink-400 text-sm mt-1">Public status page showing system uptime and incidents</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={statusPageEnabled}
                  onChange={(e) => setStatusPageEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-ink-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
              </label>
            </div>

            {statusPageEnabled && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Subdomain</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        className="input flex-1"
                        placeholder="status"
                        value={statusPageConfig.subdomain}
                        onChange={(e) => setStatusPageConfig({...statusPageConfig, subdomain: e.target.value})}
                      />
                      <span className="text-ink-400">.propreel.co.za</span>
                    </div>
                  </div>
                  <div>
                    <label className="label">Custom Domain (optional)</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="status.propreel.co.za"
                      value={statusPageConfig.customDomain}
                      onChange={(e) => setStatusPageConfig({...statusPageConfig, customDomain: e.target.value})}
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Company Name</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="PropReel"
                    value={statusPageConfig.companyName}
                    onChange={(e) => setStatusPageConfig({...statusPageConfig, companyName: e.target.value})}
                  />
                </div>

                <div>
                  <label className="label">Logo URL</label>
                  <input
                    type="url"
                    className="input"
                    placeholder="https://propreel.co.za/logo.png"
                    value={statusPageConfig.logoUrl}
                    onChange={(e) => setStatusPageConfig({...statusPageConfig, logoUrl: e.target.value})}
                  />
                </div>

                <div>
                  <label className="label">Support Email</label>
                  <input
                    type="email"
                    className="input"
                    placeholder="support@propreel.co.za"
                    value={statusPageConfig.supportEmail}
                    onChange={(e) => setStatusPageConfig({...statusPageConfig, supportEmail: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={statusPageConfig.showUptime}
                      onChange={(e) => setStatusPageConfig({...statusPageConfig, showUptime: e.target.checked})}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-sm text-ink-300">Show uptime statistics</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={statusPageConfig.showIncidents}
                      onChange={(e) => setStatusPageConfig({...statusPageConfig, showIncidents: e.target.checked})}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-sm text-ink-300">Show incident history</span>
                  </label>
                </div>

                <div className="flex gap-3 mt-6">
                  <button className="btn btn-primary">
                    <Check className="w-4 h-4" /> Save Configuration
                  </button>
                  <button className="btn btn-secondary">
                    <Globe className="w-4 h-4" /> View Status Page
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="card-dark p-6">
            <h4 className="font-semibold text-white mb-3">Monitored Services</h4>
            <div className="space-y-2">
              {[
                { name: 'Website', status: 'operational', uptime: '99.98%' },
                { name: 'API', status: 'operational', uptime: '99.95%' },
                { name: 'Video Rendering', status: 'operational', uptime: '99.90%' },
                { name: 'AI Image Processing', status: 'operational', uptime: '99.92%' },
                { name: 'Payment Processing', status: 'operational', uptime: '100%' }
              ].map(service => (
                <div key={service.name} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${service.status === 'operational' ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="text-sm text-white">{service.name}</span>
                  </div>
                  <span className="text-xs text-ink-400">{service.uptime} uptime</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Reports */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="card-dark p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-purple-400" /> Monthly PDF Reports
                </h3>
                <p className="text-ink-400 text-sm mt-1">Automated monthly reports with custom branding</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={reportsEnabled}
                  onChange={(e) => setReportsEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-ink-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>

            {reportsEnabled && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Generate Reports On</label>
                    <select
                      className="input"
                      value={reportConfig.generateOnDay}
                      onChange={(e) => setReportConfig({...reportConfig, generateOnDay: Number(e.target.value)})}
                    >
                      <option value={1}>1st of each month</option>
                      <option value={15}>15th of each month</option>
                      <option value={28}>28th of each month</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Report Header Text</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="PropReel Monthly Report"
                      value={reportConfig.reportHeader}
                      onChange={(e) => setReportConfig({...reportConfig, reportHeader: e.target.value})}
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Custom Report Logo</label>
                  <div className="border-2 border-dashed border-white/10 rounded-xl p-6 text-center hover:border-purple-500/30 transition cursor-pointer">
                    <Upload className="w-8 h-8 text-ink-400 mx-auto mb-2" />
                    <p className="text-ink-400 text-sm">Upload custom logo for reports</p>
                    <p className="text-ink-500 text-xs mt-1">PNG, JPG up to 2MB</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm text-white font-medium">Include in Report:</p>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={reportConfig.includeUsage}
                      onChange={(e) => setReportConfig({...reportConfig, includeUsage: e.target.checked})}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-sm text-ink-300">Usage statistics</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={reportConfig.includeCredits}
                      onChange={(e) => setReportConfig({...reportConfig, includeCredits: e.target.checked})}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-sm text-ink-300">Credit usage breakdown</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={reportConfig.includeRenders}
                      onChange={(e) => setReportConfig({...reportConfig, includeRenders: e.target.checked})}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-sm text-ink-300">Render history</span>
                  </label>
                </div>

                <div className="border-t border-white/5 pt-4 mt-4">
                  <h4 className="text-sm font-medium text-white mb-3">Webhook Notifications</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="label flex items-center gap-2">
                        <Zap className="w-4 h-4 text-yellow-400" />
                        Slack Webhook URL
                      </label>
                      <input
                        type="url"
                        className="input"
                        placeholder="https://hooks.slack.com/services/..."
                        value={reportConfig.slackWebhook}
                        onChange={(e) => setReportConfig({...reportConfig, slackWebhook: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="label flex items-center gap-2">
                        <Mail className="w-4 h-4 text-blue-400" />
                        Email Webhook URL
                      </label>
                      <input
                        type="url"
                        className="input"
                        placeholder="https://api.emailservice.com/webhook"
                        value={reportConfig.emailWebhook}
                        onChange={(e) => setReportConfig({...reportConfig, emailWebhook: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button className="btn btn-primary">
                    <Check className="w-4 h-4" /> Save Configuration
                  </button>
                  <button className="btn btn-secondary">
                    <FileText className="w-4 h-4" /> Generate Sample Report
                  </button>
                  <button className="btn btn-secondary">
                    <Download className="w-4 h-4" /> Export Report History (ZIP)
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="card-dark p-6">
            <h4 className="font-semibold text-white mb-3">Report Distribution</h4>
            <div className="space-y-3">
              <label className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                <div>
                  <p className="text-sm text-white">Email to all agents</p>
                  <p className="text-xs text-ink-400">Send monthly report to each agent</p>
                </div>
                <input
                  type="checkbox"
                  checked={reportConfig.emailToAgents}
                  onChange={(e) => setReportConfig({...reportConfig, emailToAgents: e.target.checked})}
                  className="w-4 h-4 rounded"
                />
              </label>
              <label className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                <div>
                  <p className="text-sm text-white">Individual agent reports</p>
                  <p className="text-xs text-ink-400">Generate separate report for each agent</p>
                </div>
                <input type="checkbox" defaultChecked className="w-4 h-4 rounded" />
              </label>
              <label className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm text-white">Agency summary report</p>
                  <p className="text-xs text-ink-400">Consolidated report for agency owners</p>
                </div>
                <input type="checkbox" defaultChecked className="w-4 h-4 rounded" />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
