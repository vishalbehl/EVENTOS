"use client";

import React, { useState, useMemo } from "react";
import { 
  Mail, Search, RefreshCw, Send, Save, Layout, Eye, Code, FileCode2
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  category: "auth" | "billing" | "marketing" | "operations";
  htmlContent: string;
}

const TEMPLATES: EmailTemplate[] = [
  {
    id: "tpl-1",
    name: "Organiser Invitation",
    subject: "Welcome to Eventos! Setup your organizer account",
    category: "auth",
    htmlContent: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6; padding: 20px; }
    .card { background: white; border-radius: 12px; padding: 32px; max-width: 500px; margin: 0 auto; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
    .logo { color: #7c3aed; font-size: 24px; font-weight: 800; text-align: center; margin-bottom: 24px; }
    .button { background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">EVENTOS</div>
    <h2>Welcome to the Platform!</h2>
    <p>You have been invited by the platform supervisor to set up your organizer dashboard account for your upcoming conference.</p>
    <div style="text-align: center; margin: 24px 0;">
      <a href="{{invite_link}}" class="button">Accept Invitation</a>
    </div>
    <p style="color: #666; font-size: 11px;">If you did not request this, please ignore this email.</p>
  </div>
</body>
</html>`
  },
  {
    id: "tpl-2",
    name: "Invoice Paid Receipt",
    subject: "Receipt for Invoice #{{invoice_number}}",
    category: "billing",
    htmlContent: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6; padding: 20px; }
    .card { background: white; border-radius: 12px; padding: 32px; max-width: 500px; margin: 0 auto; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
    .badge { background: #10b981; color: white; padding: 4px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="card">
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <h2 style="color: #7c3aed; margin: 0;">Receipt</h2>
      <span class="badge">PAID</span>
    </div>
    <p>We received payment of {{invoice_amount}} for your Subscription Plan renewal.</p>
    <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin: 20px 0; font-size: 13px;">
      <strong>Invoice:</strong> {{invoice_number}}<br/>
      <strong>Date:</strong> {{invoice_date}}<br/>
      <strong>Amount Settled:</strong> {{invoice_amount}}
    </div>
    <p>Thanks for choosing Eventos!</p>
  </div>
</body>
</html>`
  },
  {
    id: "tpl-3",
    name: "Account Password Reset",
    subject: "Reset your password",
    category: "auth",
    htmlContent: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6; padding: 20px; }
    .card { background: white; border-radius: 12px; padding: 32px; max-width: 500px; margin: 0 auto; }
    .button { background: #e11d48; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Reset Password Request</h2>
    <p>A request was made to reset the password linked to this email address. Click below to continue:</p>
    <div style="text-align: center; margin: 24px 0;">
      <a href="{{reset_link}}" class="button">Reset Password</a>
    </div>
    <p style="color: #666; font-size: 11px;">Verification links expire in 1 hour.</p>
  </div>
</body>
</html>`
  }
];

export default function EmailTemplatesPage() {
  const [selectedTemplateId, setSelectedTemplateId] = useState(TEMPLATES[0].id);
  const [searchQuery, setSearchQuery] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);

  const activeTemplate = useMemo(() => {
    return TEMPLATES.find(t => t.id === selectedTemplateId) || TEMPLATES[0];
  }, [selectedTemplateId]);

  const [localHtml, setLocalHtml] = useState(activeTemplate.htmlContent);

  React.useEffect(() => {
    setLocalHtml(activeTemplate.htmlContent);
  }, [activeTemplate]);

  const handleSave = () => {
    toast.success(`Template "${activeTemplate.name}" saved successfully`);
    setIsEditMode(false);
  };

  const handleSendTest = async () => {
    setIsSendingTest(true);
    await new Promise((resolve) => setTimeout(resolve, 600));
    setIsSendingTest(false);
    toast.success("Test email dispatched to platform support inbox");
  };

  const filteredTemplates = useMemo(() => {
    return TEMPLATES.filter(t => 
      searchQuery === "" || 
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.subject.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  return (
    <PageContainer>
      <SectionHeader
        title="Email Templates"
        description="Edit transactional email layouts, customize regional headers, and dispatch sandbox test deliveries."
        breadcrumb={["Console", "Settings", "Email Templates"]}
        actions={
          <div className="flex gap-2">
            <Button
              onClick={handleSendTest}
              disabled={isSendingTest}
              size="sm"
              variant="outline"
              className="border-border text-xs"
            >
              <Send className="w-3.5 h-3.5 mr-2 text-[var(--text-tertiary)]" /> Send Test Mail
            </Button>
            <Button
              onClick={handleSave}
              size="sm"
              className="bg-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/90 text-white font-semibold text-xs h-9 px-4 flex gap-1.5"
            >
              <Save className="w-3.5 h-3.5" /> Save Template
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6 items-start h-[600px] min-h-0">
        
        {/* Left Column (35%) — List Selector */}
        <div className="lg:col-span-3 bg-surface border border-border rounded-xl p-4 flex flex-col gap-4 h-full min-h-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 transform -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search templates..."
              className="w-full bg-surface-2 border border-border rounded-xl pl-9 pr-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--brand-primary)]"
            />
          </div>

          <div className="space-y-1.5 flex-1 overflow-y-auto no-scrollbar pr-0.5">
            {filteredTemplates.map(t => {
              const isActive = t.id === selectedTemplateId;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setSelectedTemplateId(t.id);
                    setIsEditMode(false);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between p-3.5 rounded-xl text-left border transition-all text-xs font-semibold",
                    isActive
                      ? "bg-[var(--brand-primary-muted)]/10 border-[var(--brand-primary)] text-[var(--text-primary)]"
                      : "bg-surface border-transparent hover:bg-surface-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] border-border"
                  )}
                >
                  <div className="min-w-0">
                    <span className="block truncate">{t.name}</span>
                    <span className="block text-[9px] text-[var(--text-tertiary)] truncate mt-0.5">{t.subject}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column (65%) — Editor & Preview Tab */}
        <div className="lg:col-span-7 bg-surface border border-border rounded-xl flex flex-col h-full min-h-0 overflow-hidden shadow-sm">
          {/* Editor Header controls */}
          <div className="px-4 py-3.5 border-b border-border/60 bg-surface-2/30 flex items-center justify-between shrink-0">
            <div className="min-w-0">
              <h4 className="text-xs font-bold text-[var(--text-primary)] truncate">{activeTemplate.name}</h4>
              <p className="text-[10px] text-[var(--text-tertiary)] truncate mt-0.5">Subject: {activeTemplate.subject}</p>
            </div>
            
            <div className="flex gap-1.5 bg-surface border border-border rounded-xl p-1 shrink-0">
              <button
                type="button"
                onClick={() => setIsEditMode(false)}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5",
                  !isEditMode ? "bg-surface-2 text-[var(--text-primary)] shadow-sm" : "text-[var(--text-secondary)]"
                )}
              >
                <Eye className="w-3.5 h-3.5" />
                Live Preview
              </button>
              <button
                type="button"
                onClick={() => setIsEditMode(true)}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5",
                  isEditMode ? "bg-surface-2 text-[var(--text-primary)] shadow-sm" : "text-[var(--text-secondary)]"
                )}
              >
                <Code className="w-3.5 h-3.5" />
                Source Code
              </button>
            </div>
          </div>

          {/* Body Viewer */}
          <div className="flex-1 min-h-0 bg-surface-2/45 relative">
            {isEditMode ? (
              <textarea
                value={localHtml}
                onChange={(e) => setLocalHtml(e.target.value)}
                className="w-full h-full p-4 font-mono text-xs text-[var(--brand-primary)] bg-surface outline-none resize-none border-0"
              />
            ) : (
              <iframe
                srcDoc={localHtml}
                title="Email Template Render Frame"
                className="w-full h-full border-0 bg-white"
                sandbox="allow-same-origin"
              />
            )}
          </div>
        </div>

      </div>
    </PageContainer>
  );
}
