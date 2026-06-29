"use client"

import React, { useState } from "react"
import { usePromptLibrary } from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader"
import { Button } from "@/components/ui/button"
import { Star, Edit, Trash2, Plus, RefreshCw, Terminal, Info } from "lucide-react"

export default function PromptsPage() {
  const { data: prompts = [], isLoading, error, refetch } = usePromptLibrary()
  const [activeTab, setActiveTab] = useState<"all" | "my" | "shared" | "favorites">("all")
  const [showAddForm, setShowAddForm] = useState(false)
  const [newPrompt, setNewPrompt] = useState({ name: "", category: "General", use_case: "", model: "gpt-4o", template: "" })

  if (isLoading) return <div className="p-8 text-center text-secondary">Loading prompt library...</div>
  if (error) return <div className="p-8 text-center text-danger">Failed to load prompts</div>

  // Filter prompts according to tab selection (mock filtering for now since they are empty)
  const filteredPrompts = prompts.filter(p => {
    if (activeTab === "favorites") return false
    return true
  })

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-4">
        <SectionHeader title="Prompt Library" description="Configure global system instructions, assistant templates, and LLM behavior overrides." />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="flex items-center gap-1 text-xs">
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setShowAddForm(!showAddForm)} className="flex items-center gap-1 text-xs bg-brand-primary text-white">
            <Plus className="h-4 w-4" /> New Prompt
          </Button>
        </div>
      </div>

      {showAddForm && (
        <div className="bg-surface border border-border rounded-xl p-5 mb-6 space-y-4 max-w-2xl">
          <h3 className="text-sm font-semibold text-primary">Create System Prompt Template</h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-secondary mb-1 block">Prompt Name</label>
              <input
                value={newPrompt.name}
                onChange={e => setNewPrompt({ ...newPrompt, name: e.target.value })}
                className="w-full text-sm px-3 py-1.5 bg-bg-base border border-border rounded-lg text-primary focus:outline-none focus:border-brand"
                placeholder="e.g. Ticket Auto-Responder"
              />
            </div>
            <div>
              <label className="text-xs text-secondary mb-1 block">Category</label>
              <select
                value={newPrompt.category}
                onChange={e => setNewPrompt({ ...newPrompt, category: e.target.value })}
                className="w-full text-sm px-3 py-1.5 bg-bg-base border border-border rounded-lg text-primary focus:outline-none focus:border-brand"
              >
                <option value="General">General</option>
                <option value="Support">Support</option>
                <option value="Marketing">Marketing</option>
                <option value="Moderation">Moderation</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-secondary mb-1 block">Model Selector</label>
              <select
                value={newPrompt.model}
                onChange={e => setNewPrompt({ ...newPrompt, model: e.target.value })}
                className="w-full text-sm px-3 py-1.5 bg-bg-base border border-border rounded-lg text-primary focus:outline-none focus:border-brand"
              >
                <option value="gpt-4o">gpt-4o</option>
                <option value="claude-3-5-sonnet">claude-3-5-sonnet</option>
                <option value="gemini-1.5-pro">gemini-1.5-pro</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-secondary mb-1 block">Use Case / Description</label>
            <input
              value={newPrompt.use_case}
              onChange={e => setNewPrompt({ ...newPrompt, use_case: e.target.value })}
              className="w-full text-sm px-3 py-1.5 bg-bg-base border border-border rounded-lg text-primary focus:outline-none focus:border-brand"
              placeholder="Describe the operational use case"
            />
          </div>

          <div>
            <label className="text-xs text-secondary mb-1 block">Template Textarea</label>
            <textarea
              value={newPrompt.template}
              onChange={e => setNewPrompt({ ...newPrompt, template: e.target.value })}
              className="w-full h-24 text-sm px-3 py-1.5 bg-bg-base border border-border rounded-lg text-primary focus:outline-none focus:border-brand font-mono"
              placeholder="You are an AI assistant for EventX. Respond to {{user_name}} regarding their ticket..."
            />
            <p className="text-[10px] text-tertiary mt-1 flex items-center gap-1">
              <Info className="h-3 w-3" /> Hint: Use double curly brackets for dynamic variables: e.g. {"{{user_name}}"}, {"{{ticket_subject}}"}
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>Cancel</Button>
            <Button size="sm" className="bg-brand-primary text-white" disabled={!newPrompt.name || !newPrompt.template}>Save Prompt</Button>
          </div>
        </div>
      )}

      {/* Tabs list */}
      <div className="flex border-b border-border mb-6">
        {[
          { id: "all", label: "All Prompts" },
          { id: "my", label: "My Prompts" },
          { id: "shared", label: "Shared With Me" },
          { id: "favorites", label: "Favorites" },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === tab.id ? "border-brand-primary text-brand-primary" : "border-transparent text-secondary hover:text-primary"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filteredPrompts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-surface border border-border rounded-xl">
          <Terminal className="h-12 w-12 text-tertiary mb-3 animate-pulse" />
          <h3 className="text-sm font-bold text-primary mb-1">No Prompts configured yet</h3>
          <p className="text-xs text-secondary mb-4">Get started by creating your first system prompt template.</p>
          <Button size="sm" onClick={() => setShowAddForm(true)} className="bg-brand-primary text-white text-xs">
            + New Prompt
          </Button>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-secondary text-xs">
                  <th className="py-2.5">Prompt Name</th>
                  <th className="py-2.5">Category</th>
                  <th className="py-2.5">Use Case</th>
                  <th className="py-2.5">Model</th>
                  <th className="py-2.5 text-right">Usage</th>
                  <th className="py-2.5 text-right">Success Rate</th>
                  <th className="py-2.5">Last Used</th>
                  <th className="py-2.5 font-medium">Created By</th>
                  <th className="py-2.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-primary">
                {filteredPrompts.map(p => (
                  <tr key={p.id} className="hover:bg-surface-hover transition-colors">
                    <td className="py-3 font-semibold">{p.name}</td>
                    <td className="py-3 text-secondary">{p.category}</td>
                    <td className="py-3 text-secondary">{p.use_case}</td>
                    <td className="py-3 font-mono text-xs text-secondary">{p.model}</td>
                    <td className="py-3 text-right font-mono">{p.usage_count.toLocaleString()}</td>
                    <td className="py-3 text-right font-mono font-bold text-success">{p.success_rate.toFixed(1)}%</td>
                    <td className="py-3 text-xs text-secondary">{p.last_used_at ? new Date(p.last_used_at).toLocaleDateString() : "Never"}</td>
                    <td className="py-3 text-secondary text-xs">{p.created_by_name}</td>
                    <td className="py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button className="p-1 hover:bg-surface-2 rounded text-secondary hover:text-warning" title="Star Favorite">
                          <Star className="h-4 w-4" />
                        </button>
                        <button className="p-1 hover:bg-surface-2 rounded text-secondary hover:text-primary" title="Edit">
                          <Edit className="h-4 w-4" />
                        </button>
                        <button className="p-1 hover:bg-surface-2 rounded text-secondary hover:text-danger" title="Delete">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PageContainer>
  )
}
