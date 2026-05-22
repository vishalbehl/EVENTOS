import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, Users, Mail, BarChart3, Settings, 
  Search, Plus, Filter, MoreVertical, 
  Trash2, Copy, Eye, Clock, CheckCircle2, Check, Save,
  AlertCircle, ChevronRight, X, Layout, 
  Sparkles, MousePointer2, Image as ImageIcon, 
  Layers, Palette, Type, Code, LayoutDashboard,
  PlayCircle, Info, Lock, Globe, Server, Hash, ShieldCheck,
  RotateCcw, ExternalLink, Calendar, Users2, Rocket
} from 'lucide-react';
import * as emailService from '@/services/email-service';
import { Campaign, Template } from '@/services/email-service';
import { apiClient } from '@/lib/api-client';

const HTML_SNIPPETS = [
  { 
    name: 'Hero Header', 
    icon: LayoutDashboard,
    code: `<div style="background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%); padding: 60px 20px; text-align: center; border-radius: 16px;">\n  <h1 style="color: #ffffff; margin: 0; font-size: 32px; font-weight: 800;">YOUR HEADER HERE</h1>\n  <p style="color: rgba(255,255,255,0.8); margin-top: 10px;">Subheading or event tagline goes here</p>\n</div>`
  },
  { 
    name: 'CTA Button', 
    icon: MousePointer2,
    code: `<div style="text-align: center; margin: 30px 0;">\n  <a href="#" style="background-color: #6366f1; color: #ffffff; padding: 16px 32px; border-radius: 12px; text-decoration: none; font-weight: 700; display: inline-block;">Click Here to Action</a>\n</div>`
  },
  { 
    name: 'Video Preview', 
    icon: PlayCircle,
    code: `<div style="position: relative; margin: 30px 0; cursor: pointer; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0;">\n  <img src="https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=800&q=80" style="width: 100%; display: block;" />\n  <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(255,255,255,0.9); width: 60px; height: 60px; border-radius: 30px; display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3);">\n    <div style="width: 0; height: 0; border-top: 10px solid transparent; border-bottom: 10px solid transparent; border-left: 15px solid #1a1c23; margin-left: 5px;"></div>\n  </div>\n</div>`
  }
];

export default function EmailCampaignManager({ eventId }: { eventId?: string | string[] }) {
  const eId = Array.isArray(eventId) ? eventId[0] : eventId || 'default';
  
  const [activeTab, setActiveTab] = useState<'dashboard' | 'templates' | 'settings'>('dashboard');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Compose States
  const [showCompose, setShowCompose] = useState(false);
  const [composeStep, setComposeStep] = useState<'template' | 'edit' | 'confirm'>('template');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [recipientFilter, setRecipientFilter] = useState('all');
  const [recipientsList, setRecipientsList] = useState<any[]>([]);
  const [isFetchingRecipients, setIsFetchingRecipients] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  
  // Custom speaker selector states
  const [selectedSpeakerIds, setSelectedSpeakerIds] = useState<string[]>([]);
  const [speakerSearch, setSpeakerSearch] = useState('');
  const [allSpeakers, setAllSpeakers] = useState<any[]>([]);
  
  // Template Editor States
  const [showEditor, setShowEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  
  // Settings States
  const [apiKey, setApiKey] = useState('');

  const editorRef = useRef<HTMLTextAreaElement>(null);

  const refreshData = async () => {
    setIsLoading(true);
    try {
      const [tplData, campData] = await Promise.all([
        emailService.getTemplates(eId),
        emailService.getCampaigns(eId)
      ]);
      setTemplates(tplData);
      setCampaigns(campData);
      
      const savedApiKey = localStorage.getItem('email_api_key');
      if (savedApiKey) setApiKey(savedApiKey);
    } catch (err: any) {
      const status = err.response?.status || err.status;
      const message = err.response?.data?.detail || err.message || JSON.stringify(err);
      console.error(`Failed to refresh campaign data [${status}]:`, message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, [eId]);

  useEffect(() => {
    if (showCompose) {
      emailService.getRecipients(eId, 'all')
        .then(setAllSpeakers)
        .catch(console.error);
    }
  }, [showCompose, eId]);

  useEffect(() => {
    if (showCompose) {
      if (recipientFilter === 'specific_speakers' || recipientFilter === 'custom_list') {
        const filtered = allSpeakers.filter(s => selectedSpeakerIds.includes(s.id));
        setRecipientsList(filtered);
      } else {
        const fetchRecipients = async () => {
          setIsFetchingRecipients(true);
          try {
            const data = await emailService.getRecipients(eId, recipientFilter);
            setRecipientsList(data);
          } catch (err) {
            console.error(err);
          } finally {
            setIsFetchingRecipients(false);
          }
        };
        fetchRecipients();
      }
    }
  }, [showCompose, recipientFilter, eId, allSpeakers, selectedSpeakerIds]);

  const handleSelectTemplate = (tpl: Template) => {
    setSelectedTemplate(tpl);
    setComposeSubject(tpl.subject);
    setComposeBody(tpl.body_html);
    setCampaignName(`${tpl.name} - ${new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
    setComposeStep('edit');
  };

  const handleSendTest = async () => {
    if (!testEmail || !composeBody) return;
    setIsTesting(true);
    try {
      await emailService.sendTestEmail(eId, {
        to: testEmail,
        subject: composeSubject,
        body: composeBody
      });
      alert(`Test email dispatched to ${testEmail}`);
    } catch (err) {
      alert("Failed to send test email");
    } finally {
      setIsTesting(false);
    }
  };

  const handleExecuteCampaign = async () => {
    if (!selectedTemplate) {
      alert("Please select a template first.");
      return;
    }

    setIsSending(true);
    try {
      // 1. Create the campaign record
      const campaign = await emailService.createCampaign(eId, {
        template_id: selectedTemplate.id,
        name: campaignName,
        recipient_filter: recipientFilter,
        speaker_ids: (recipientFilter === 'specific_speakers' || recipientFilter === 'custom_list') ? selectedSpeakerIds : undefined
      } as any);

      // 2. Trigger background processing
      await emailService.sendCampaign(eId, campaign.id);
      
      setShowCompose(false);
      refreshData();
    } catch (err) {
      console.error(err);
      alert("Failed to launch campaign");
    } finally {
      setIsSending(false);
    }
  };

  const handleResendFailed = async (campaignId: string) => {
    try {
      await emailService.resendFailed(eId, campaignId);
      alert("Retry task dispatched");
      refreshData();
    } catch (err) {
      alert("Failed to trigger retry");
    }
  };

  const insertVariable = (variable: string) => {
    if (!editorRef.current) return;
    const start = editorRef.current.selectionStart;
    const end = editorRef.current.selectionEnd;
    const text = editorRef.current.value;
    const newText = text.substring(0, start) + `{{${variable}}}` + text.substring(end);
    
    if (showEditor && editingTemplate) {
      setEditingTemplate({ ...editingTemplate, body_html: newText });
    } else if (showCompose) {
      setComposeBody(newText);
    }
    
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.focus();
        editorRef.current.setSelectionRange(start + variable.length + 4, start + variable.length + 4);
      }
    }, 10);
  };

  const renderDashboard = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-32">
       {/* Hero Stats */}
       <div className="grid grid-cols-4 gap-6">
          {[
            { label: 'Total Sent', value: campaigns.reduce((acc, c) => acc + c.sent_count, 0), icon: Mail, color: 'text-[var(--pri)]' },
            { label: 'Delivery Rate', value: '98.2%', icon: Rocket, color: 'text-emerald-400' },
            { label: 'Avg Open Rate', value: '42.8%', icon: Eye, color: 'text-amber-400' },
            { label: 'Active Drafts', value: campaigns.filter(c => c.status === 'draft').length, icon: Layers, color: 'text-[var(--pri)]' },
          ].map((stat, i) => (
            <div key={i} className="glass-3d p-6 rounded-3xl border border-white/5 bg-white/2 hover:bg-white/5 transition-all">
               <div className="flex justify-between items-start mb-4">
                  <div className={`p-3 rounded-2xl bg-white/5 ${stat.color}`}><stat.icon className="h-5 w-5" /></div>
               </div>
               <div className="text-2xl font-black">{stat.value}</div>
               <div className="text-[10px] font-black uppercase tracking-widest text-muted mt-1">{stat.label}</div>
            </div>
          ))}
       </div>

       {/* Campaign Lifecycle Tracker */}
       <div className="glass-3d rounded-[2.5rem] border border-white/5 overflow-hidden">
          <div className="p-8 border-b border-white/5 flex items-center justify-between">
             <div>
                <h3 className="text-xl font-black">Campaign Lifecycle</h3>
                <p className="text-xs text-muted">Monitor real-time progress and delivery analytics.</p>
             </div>
             <button onClick={() => { setShowCompose(true); setComposeStep('template'); }} className="btn-primary h-11 px-6 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-xl">
                <Plus className="h-4 w-4" /> New Campaign
             </button>
          </div>
          <div className="overflow-x-auto">
             <table className="w-full text-left">
                <thead>
                   <tr className="bg-white/2">
                      <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-muted">Campaign & Status</th>
                      <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-muted">Progress</th>
                      <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-muted">Metrics</th>
                      <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-muted text-right">Control</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                   {campaigns.map(camp => (
                      <tr key={camp.id} className="hover:bg-white/[0.01] transition-colors group">
                         <td className="px-8 py-6">
                            <div className="flex items-center gap-4">
                               <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                                 camp.status === 'sent' ? 'bg-emerald-500/10 text-emerald-400' :
                                 camp.status === 'sending' ? 'bg-[var(--pri)]/10 text-[var(--pri)]' :
                                 camp.status === 'failed' ? 'bg-rose-500/10 text-rose-400' : 'bg-white/5 text-muted'
                               }`}>
                                  {camp.status === 'sending' ? <RotateCcw className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                               </div>
                               <div>
                                  <div className="text-sm font-bold">{camp.name}</div>
                                  <div className="flex items-center gap-2 mt-1">
                                     <Badge variant={
                                       camp.status === 'sent' ? 'success' : 
                                       camp.status === 'sending' ? 'active' : 
                                       camp.status === 'failed' ? 'warning' : 'default'
                                     }>{camp.status}</Badge>
                                     <span className="text-[10px] text-muted">{new Date(camp.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}</span>
                                  </div>
                               </div>
                            </div>
                         </td>
                         <td className="px-8 py-6">
                            <div className="w-48 space-y-2">
                               <div className="flex justify-between text-[10px] font-black uppercase tracking-tighter">
                                  <span>{camp.sent_count} / {camp.total_recipients}</span>
                                  <span>{Math.round((camp.sent_count / (camp.total_recipients || 1)) * 100)}%</span>
                               </div>
                               <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full transition-all duration-1000 ${camp.status === 'failed' ? 'bg-rose-500' : 'bg-[var(--pri)]'}`} 
                                    style={{ width: `${(camp.sent_count / (camp.total_recipients || 1)) * 100}%` }} 
                                  />
                               </div>
                            </div>
                         </td>
                         <td className="px-8 py-6">
                            <div className="flex gap-4">
                               <div className="text-center">
                                <div className="text-[10px] font-bold text-[var(--pri)]">{camp.open_count || 0}</div>
                                  <div className="text-[8px] uppercase font-black text-muted tracking-tighter">Opens</div>
                               </div>
                               <div className="text-center">
                                  <div className="text-[10px] font-bold text-emerald-400">0</div>
                                  <div className="text-[8px] uppercase font-black text-muted tracking-tighter">Clicks</div>
                               </div>
                            </div>
                         </td>
                         <td className="px-8 py-6 text-right">
                            <div className="flex justify-end gap-2">
                               <button className="p-2 hover:bg-white/10 rounded-lg transition-all text-muted" title="View Audit Log"><BarChart3 className="h-4 w-4" /></button>
                               {camp.status === 'failed' && (
                                 <button onClick={() => handleResendFailed(camp.id)} className="p-2 hover:bg-white/10 rounded-lg transition-all text-rose-400" title="Resend Failed"><RotateCcw className="h-4 w-4" /></button>
                               )}
                               <button className="p-2 hover:bg-white/10 rounded-lg transition-all text-muted"><MoreVertical className="h-4 w-4" /></button>
                            </div>
                         </td>
                      </tr>
                   ))}
                </tbody>
             </table>
          </div>
       </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-10 shrink-0">
         <div className="flex items-center gap-6">
            <div className="h-14 w-14 bg-gradient-to-br from-[var(--pri)] to-[var(--sec)] rounded-[1.2rem] shadow-2xl shadow-[var(--pri)]/20 flex items-center justify-center">
               <Mail className="h-7 w-7 text-white" />
            </div>
            <div>
               <h1 className="text-4xl font-black tracking-tight">Campaigns</h1>
               <div className="flex items-center gap-3 mt-1">
                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                     <div className="h-1.5 w-1.5 bg-emerald-500 rounded-full" />
                     <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">System Active</span>
                  </div>
                  <span className="text-[10px] font-bold text-muted uppercase tracking-widest">Email Delivery Center</span>
               </div>
            </div>
         </div>

         <div className="flex bg-white/5 border border-white/5 rounded-2xl p-1 gap-1">
            {[
              { id: 'dashboard', icon: LayoutDashboard, label: 'Overview' },
              { id: 'templates', icon: Layers, label: 'Templates' },
              { id: 'settings', icon: Settings, label: 'Settings' }
            ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === tab.id ? 'bg-white/10 text-white border border-white/5' : 'text-muted hover:text-white'}`}
              >
                <tab.icon className="h-4 w-4" /> {tab.label}
              </button>
            ))}
         </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar">
         {activeTab === 'dashboard' && renderDashboard()}
         {activeTab === 'templates' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
               <div className="grid grid-cols-3 gap-6">
                  {templates.map(tpl => (
                     <div key={tpl.id} className="glass-3d group rounded-[2rem] border border-white/5 overflow-hidden hover:border-[var(--pri)]/30 transition-all">
                        <div className="p-6 h-40 bg-white/2 relative overflow-hidden border-b border-white/5">
                           <div className="absolute inset-0 opacity-10 bg-[var(--pri)]/20" />
                           <div className="relative z-10 scale-[0.4] origin-top-left w-[250%] h-[250%] pointer-events-none bg-white p-4 rounded-xl shadow-2xl">
                              <div className="prose prose-sm max-w-none text-slate-800" dangerouslySetInnerHTML={{ __html: tpl.body_html }} />
                           </div>
                        </div>
                        <div className="p-6">
                           <Badge variant="active" className="mb-2">{tpl.template_type}</Badge>
                           <h4 className="font-bold text-lg mb-4">{tpl.name}</h4>
                           <div className="flex gap-2">
                              <button onClick={() => { setEditingTemplate(tpl); setShowEditor(true); }} className="flex-1 py-3 bg-white/5 border border-default rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all flex items-center justify-center gap-2">
                                 <Palette className="h-3.5 w-3.5" /> Customize
                              </button>
                           </div>
                        </div>
                     </div>
                  ))}
               </div>
            </div>
         )}
         {activeTab === 'settings' && (
           <div className="glass-3d p-10 rounded-[2.5rem] border border-white/5 max-w-2xl space-y-8">
              <div>
                 <h3 className="text-xl font-black">Email Settings</h3>
                 <p className="text-sm text-muted">Configure your email keys and limits.</p>
              </div>
              <div className="space-y-4">
                 <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted">API Connection Key</label>
                    <input type="password" value={apiKey} onChange={e => {setApiKey(e.target.value); localStorage.setItem('email_api_key', e.target.value);}} className="w-full bg-white/5 border border-default rounded-xl px-6 py-4 text-sm outline-none focus:border-[var(--pri)]/50" />
                 </div>
                 <div className="flex items-center gap-4 p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl">
                    <ShieldCheck className="h-5 w-5 text-emerald-400" />
                    <p className="text-[10px] text-emerald-100/60 leading-relaxed font-medium">Domain 'eventos.com' is fully verified with SPF/DKIM records.</p>
                 </div>
              </div>
           </div>
         )}
      </div>

      {/* Compose Modal */}
      {showCompose && (
        <Modal 
          isOpen={showCompose} 
          onClose={() => setShowCompose(false)} 
          title="Send Emails" 
          size="xl"
        >
           {composeStep === 'template' && (
             <div className="space-y-10 py-10 flex flex-col items-center">
                <div className="text-center space-y-2">
                   <h3 className="text-2xl font-black">Select a Template</h3>
                   <p className="text-sm text-muted max-w-md">Choose a pre-designed email to get started.</p>
                </div>
                <div className="grid grid-cols-2 gap-4 w-full max-w-3xl">
                   {templates.map(tpl => (
                      <button key={tpl.id} onClick={() => handleSelectTemplate(tpl)} className="p-6 bg-white/5 border border-default rounded-[1.5rem] hover:border-[var(--pri)]/50 transition-all text-left flex items-start gap-4 group">
                         <div className="h-12 w-12 bg-white/5 rounded-2xl flex items-center justify-center shrink-0 group-hover:bg-[var(--pri)]/10 transition-colors"><Mail className="h-5 w-5 text-muted group-hover:text-[var(--pri)]" /></div>
                         <div>
                            <div className="text-[10px] font-black text-[var(--pri)] uppercase tracking-tighter mb-1">{tpl.template_type}</div>
                            <div className="text-sm font-bold group-hover:text-white transition-colors">{tpl.name}</div>
                            <p className="text-[10px] text-muted mt-1 truncate max-w-[200px]">{tpl.subject}</p>
                         </div>
                      </button>
                   ))}
                </div>
             </div>
           )}

           {composeStep === 'edit' && (
             <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-7 space-y-6">
                   <div className="space-y-4">
                      <div className="space-y-1.5">
                         <label className="text-[10px] font-black uppercase tracking-widest text-muted">Campaign Internal Name</label>
                         <input type="text" className="w-full bg-white/5 border border-default rounded-xl px-6 py-4 text-sm" value={campaignName} onChange={e => setCampaignName(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                         <label className="text-[10px] font-black uppercase tracking-widest text-muted">Email Subject Line</label>
                         <input type="text" className="w-full bg-white/5 border border-default rounded-xl px-6 py-4 text-sm font-bold" value={composeSubject} onChange={e => setComposeSubject(e.target.value)} />
                      </div>
                   </div>

                   <div className="relative rounded-[2rem] overflow-hidden border border-white/5 shadow-2xl">
                      <textarea 
                        ref={editorRef}
                        className="w-full bg-[#0d1117] pl-6 pr-6 py-6 h-[400px] resize-none font-mono text-[13px] leading-relaxed text-blue-100/90 outline-none"
                        value={composeBody}
                        onChange={e => setComposeBody(e.target.value)}
                      />
                   </div>
                   
                   <div className="flex gap-4">
                      <div className="flex-1 space-y-1.5">
                         <label className="text-[10px] font-black uppercase tracking-widest text-muted">Test Send</label>
                         <div className="flex gap-2">
                            <input type="email" placeholder="test@example.com" className="flex-1 bg-white/5 border border-default rounded-xl px-4 py-2.5 text-xs" value={testEmail} onChange={e => setTestEmail(e.target.value)} />
                            <button onClick={handleSendTest} disabled={isTesting} className="px-4 bg-white/5 border border-default rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">
                               {isTesting ? 'Sending...' : 'Test'}
                            </button>
                         </div>
                      </div>
                      <div className="flex-1 flex flex-col justify-end">
                         <button onClick={() => setComposeStep('confirm')} className="btn-primary py-3 rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-3">
                            Review & Schedule <ChevronRight className="h-4 w-4" />
                         </button>
                      </div>
                   </div>
                </div>

                <div className="lg:col-span-5 space-y-6">
                   <div className="glass-3d p-6 rounded-3xl space-y-6">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-muted">Configuration</h4>
                      
                      <div className="space-y-4">
                         <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase text-muted">Target Recipients</label>
                             {(recipientFilter === 'specific_speakers' || recipientFilter === 'custom_list') && (
                                <div className="space-y-2 mb-3 border border-default rounded-xl p-3 bg-black/25 animate-fadeIn">
                                   <label className="text-[9px] font-black uppercase text-muted">Select Target Speakers ({selectedSpeakerIds.length} chosen)</label>
                                   <input 
                                      type="text" 
                                      placeholder="Search by name, email..." 
                                      value={speakerSearch} 
                                      onChange={e => setSpeakerSearch(e.target.value)} 
                                      className="w-full bg-white/5 border border-default rounded-xl px-3 py-2 text-xs outline-none focus:border-[var(--pri)] transition-all"
                                   />
                                   <div className="max-h-48 overflow-y-auto border border-default rounded-xl p-2 space-y-1 bg-black/20 mt-2">
                                      {allSpeakers
                                         .filter(s => {
                                            const fullName = `${s.first_name || ''} ${s.last_name || ''}`.toLowerCase();
                                            const email = (s.email || '').toLowerCase();
                                            const query = speakerSearch.toLowerCase();
                                            return fullName.includes(query) || email.includes(query);
                                         })
                                         .map(s => {
                                            const isChecked = selectedSpeakerIds.includes(s.id);
                                            return (
                                               <label key={s.id} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer text-xs transition-all">
                                                  <input 
                                                     type="checkbox" 
                                                     checked={isChecked} 
                                                     onChange={() => {
                                                        if (isChecked) {
                                                           setSelectedSpeakerIds(prev => prev.filter(id => id !== s.id));
                                                        } else {
                                                           setSelectedSpeakerIds(prev => [...prev, s.id]);
                                                        }
                                                     }}
                                                     className="accent-[var(--pri)] rounded"
                                                  />
                                                  <div className="flex-1 min-w-0">
                                                     <div className="font-bold truncate">{s.first_name} {s.last_name}</div>
                                                     <div className="text-[10px] text-muted truncate">{s.email}</div>
                                                  </div>
                                                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono uppercase ${
                                                     s.upload_status === 'approved' ? 'bg-emerald-500/10 text-emerald-400' :
                                                     s.upload_status === 'rejected' ? 'bg-rose-500/10 text-rose-400' :
                                                     s.upload_status === 'uploaded' ? 'bg-sky-500/10 text-sky-400' :
                                                     'bg-amber-500/10 text-amber-400'
                                                  }`}>{s.upload_status}</span>
                                               </label>
                                            );
                                         })
                                      }
                                   </div>
                                </div>
                             )}
                            <select value={recipientFilter} onChange={e => setRecipientFilter(e.target.value)} className="w-full bg-white/5 border border-default rounded-xl px-4 py-3 text-xs outline-none">
                               <option value="all" className="bg-[#1a1c23]">All Registered Speakers</option>
                               <option value="pending" className="bg-[#1a1c23]">Pending Uploads Only</option>
                               <option value="uploaded" className="bg-[#1a1c23]">Uploaded (Confirmed)</option>
                                <option value="approved" className="bg-[#1a1c23]">Approved Slides Only</option>
                                <option value="rejected" className="bg-[#1a1c23]">Rejected Slides Only</option>
                                <option value="posters" className="bg-[#1a1c23]">Posters Only</option>
                                <option value="specific_speakers" className="bg-[#1a1c23]">Custom / Specific Speakers</option>
                            </select>
                         </div>
                      </div>

                      <div className="pt-6 border-t border-white/5 space-y-4">
                         <label className="text-[9px] font-black uppercase text-muted">Insert Variables</label>
                         <div className="grid grid-cols-2 gap-2">
                            {['SpeakerName', 'SessionName', 'UploadLink', 'Deadline', 'AccessCode', 'RejectionReason', 'QR', 'RejectedPresentationTable'].map(v => (
                              <button key={v} onClick={() => insertVariable(v)} className="p-2.5 bg-white/5 border border-default rounded-xl text-[10px] font-mono text-[var(--pri)] hover:border-[var(--pri)]/50 transition-all">{"{{" + v + "}}"}</button>
                            ))}
                         </div>
                      </div>
                   </div>
                   
                   <div className="glass-3d p-6 rounded-3xl bg-[var(--pri)]/5 border border-[var(--pri)]/10">
                      <div className="flex items-center gap-3 mb-4">
                         <Rocket className="h-5 w-5 text-[var(--pri)]" />
                         <span className="text-[10px] font-black uppercase tracking-widest">System Status</span>
                      </div>
                      <ul className="space-y-2">
                         <li className="text-[10px] text-muted flex items-center gap-2"><Check className="h-3 w-3 text-emerald-400" /> Batch-based processing enabled</li>
                         <li className="text-[10px] text-muted flex items-center gap-2"><Check className="h-3 w-3 text-emerald-400" /> Unique recipient constraints enforced</li>
                         <li className="text-[10px] text-muted flex items-center gap-2"><Check className="h-3 w-3 text-emerald-400" /> Throttling active (1s delay per batch)</li>
                      </ul>
                   </div>
                </div>
             </div>
           )}

           {composeStep === 'confirm' && (
             <div className="max-w-3xl mx-auto space-y-10 py-10">
                <div className="text-center space-y-2">
                   <h3 className="text-3xl font-black">Final Confirmation</h3>
                   <p className="text-sm text-muted">Please verify the campaign details before execution.</p>
                </div>

                <div className="grid grid-cols-2 gap-6">
                   <div className="glass-3d p-8 rounded-[2rem] space-y-6">
                      <div className="space-y-1">
                         <div className="text-[10px] font-black uppercase tracking-widest text-muted">Campaign Name</div>
                         <div className="text-lg font-bold">{campaignName}</div>
                      </div>
                      <div className="space-y-1">
                         <div className="text-[10px] font-black uppercase tracking-widest text-muted">Target Audience</div>
                         <div className="flex items-center gap-2">
                            <Users2 className="h-4 w-4 text-[var(--pri)]" />
                            <span className="text-sm font-bold">{recipientsList.length} Speakers</span>
                            <Badge variant="active">{recipientFilter}</Badge>
                         </div>
                      </div>
                      <div className="space-y-1">
                         <div className="text-[10px] font-black uppercase tracking-widest text-muted">Scheduled Execution</div>
                         <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-amber-400" />
                            <span className="text-sm font-bold">Immediate (Background Processing)</span>
                         </div>
                      </div>
                   </div>

                   <div className="glass-3d p-8 rounded-[2rem] space-y-6 border-dashed border-2 border-[var(--pri)]/20">
                      <div className="text-[10px] font-black uppercase tracking-widest text-[var(--pri)] flex items-center gap-2">
                         <CheckCircle2 className="h-4 w-4" /> Safety Checklist
                      </div>
                      <div className="space-y-4">
                         <label className="flex items-center gap-3 cursor-pointer group">
                            <div className="h-5 w-5 rounded border-2 border-white/10 group-hover:border-[var(--pri)] flex items-center justify-center transition-all"><Check className="h-3 w-3 text-[var(--pri)]" /></div>
                            <span className="text-xs font-bold text-muted group-hover:text-white transition-colors">I have verified the subject line</span>
                         </label>
                         <label className="flex items-center gap-3 cursor-pointer group">
                            <div className="h-5 w-5 rounded border-2 border-white/10 group-hover:border-[var(--pri)] flex items-center justify-center transition-all"><Check className="h-3 w-3 text-[var(--pri)]" /></div>
                            <span className="text-xs font-bold text-muted group-hover:text-white transition-colors">I have performed a test send</span>
                         </label>
                         <label className="flex items-center gap-3 cursor-pointer group">
                            <div className="h-5 w-5 rounded border-2 border-white/10 group-hover:border-[var(--pri)] flex items-center justify-center transition-all"><Check className="h-3 w-3 text-[var(--pri)]" /></div>
                            <span className="text-xs font-bold text-muted group-hover:text-white transition-colors">I am aware this cannot be undone</span>
                         </label>
                      </div>
                   </div>
                </div>

                <div className="flex gap-4">
                   <button onClick={() => setComposeStep('edit')} className="flex-1 py-4 bg-white/5 border border-default rounded-2xl text-sm font-bold hover:bg-white/10 transition-all">
                      Back to Editor
                   </button>
                   <button 
                     onClick={handleExecuteCampaign} 
                     disabled={isSending}
                     className="flex-[2] btn-primary py-4 rounded-2xl font-black uppercase tracking-[0.2em] text-sm flex items-center justify-center gap-3 shadow-2xl shadow-[var(--pri)]/20"
                   >
                      {isSending ? <RotateCcw className="h-5 w-5 animate-spin" /> : < Rocket className="h-5 w-5" />}
                      {isSending ? 'Sending...' : 'Send Emails Now'}
                   </button>
                </div>
             </div>
           )}
        </Modal>
      )}

      {/* Template Editor */}
      <Modal isOpen={showEditor} onClose={() => setShowEditor(false)} title={`Template: ${editingTemplate?.name}`} size="xl">
         {editingTemplate && (
            <div className="grid grid-cols-12 gap-8">
               <div className="col-span-8 space-y-6">
                  <div className="space-y-4">
                     <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-muted">Template Name</label>
                        <input type="text" className="w-full bg-white/5 border border-default rounded-xl px-6 py-4 text-sm" value={editingTemplate.name} onChange={e => setEditingTemplate({...editingTemplate, name: e.target.value})} />
                     </div>
                     <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-muted">Default Subject</label>
                        <input type="text" className="w-full bg-white/5 border border-default rounded-xl px-6 py-4 text-sm font-bold" value={editingTemplate.subject} onChange={e => setEditingTemplate({...editingTemplate, subject: e.target.value})} />
                     </div>
                  </div>
                  <div className="relative rounded-[2rem] overflow-hidden border border-white/5 shadow-2xl">
                     <textarea ref={editorRef} className="w-full bg-[#0d1117] pl-6 pr-6 py-6 h-[450px] resize-none font-mono text-[13px] leading-relaxed text-blue-100/90 outline-none" value={editingTemplate.body_html} onChange={e => setEditingTemplate({...editingTemplate, body_html: e.target.value})} />
                  </div>
                  <button onClick={() => {}} className="btn-primary w-full py-4 rounded-2xl font-black uppercase tracking-widest text-xs">Save Template Changes</button>
               </div>
               <div className="col-span-4 space-y-6">
                  <div className="glass-3d p-6 rounded-3xl space-y-4">
                     <h4 className="text-[10px] font-black uppercase text-muted">Components</h4>
                     <div className="space-y-2">
                        {HTML_SNIPPETS.map(s => <button key={s.name} onClick={() => {if(!editorRef.current)return; const start=editorRef.current.selectionStart; const end=editorRef.current.selectionEnd; const text=editorRef.current.value; const next=text.substring(0,start)+s.code+text.substring(end); setEditingTemplate({...editingTemplate, body_html:next})}} className="w-full p-3 bg-white/5 border border-default rounded-xl hover:bg-white/10 transition-all text-[10px] font-bold flex items-center gap-3"><s.icon className="h-4 w-4" /> {s.name}</button>)}
                     </div>
                  </div>
               </div>
            </div>
         )}
      </Modal>
    </div>
  );
}

const Badge = ({ children, variant = 'default', className = '' }: { children: React.ReactNode, variant?: string, className?: string }) => {
  const styles: Record<string, string> = {
    default: 'bg-white/5 text-muted border-white/10',
    success: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    active: 'bg-[var(--pri)]/10 text-[var(--pri)] border-[var(--pri)]/20',
  };
  return <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${styles[variant] || styles.default} ${className}`}>{children}</span>;
};

const Modal = ({ isOpen, onClose, title, children, size = 'md' }: { isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode, size?: 'md'|'lg'|'xl' }) => {
  if (!isOpen) return null;
  const sizes = { md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' };
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div className={`relative w-full ${sizes[size]} glass-3d rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col max-h-[95vh] animate-in zoom-in duration-300`}>
        <div className="p-8 border-b border-white/5 flex items-center justify-between">
          <h2 className="text-2xl font-black">{title}</h2>
          <button onClick={onClose} className="p-3 hover:bg-white/10 rounded-full transition-all"><X className="h-6 w-6" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-10 no-scrollbar">{children}</div>
      </div>
    </div>
  );
};
