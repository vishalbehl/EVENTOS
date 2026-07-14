"use client"

import { useState } from "react"
import { usePricingRules, useCreatePricingRule, useUpdatePricingRule, type PricingRule } from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Plus, RefreshCw, Percent, Sliders, CheckCircle2, AlertTriangle, Settings, Pencil } from "lucide-react"
import { toast } from "sonner"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"

export default function MarginRulesPage() {
  const { data: rules = [], isLoading, refetch } = usePricingRules()
  const createRule = useCreatePricingRule()
  const updateRule = useUpdatePricingRule()

  const [activeRule, setActiveRule] = useState<PricingRule | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  // Form State
  const [name, setName] = useState("")
  const [ruleCode, setRuleCode] = useState("")
  const [description, setDescription] = useState("")
  const [hardwareMarkup, setHardwareMarkup] = useState(0)
  const [staffingMarkup, setStaffingMarkup] = useState(0)
  const [managementFee, setManagementFee] = useState(0)
  const [contingency, setContingency] = useState(0)
  const [gst, setGst] = useState(18)
  const [isDefault, setIsDefault] = useState(false)
  const [isActive, setIsActive] = useState(true)

  const handleOpenCreate = () => {
    setName("")
    setRuleCode("")
    setDescription("")
    setHardwareMarkup(15)
    setStaffingMarkup(20)
    setManagementFee(10)
    setContingency(5)
    setGst(18)
    setIsDefault(false)
    setIsActive(true)
    setIsEditing(false)
    setShowForm(true)
  }

  const handleOpenEdit = (rule: PricingRule) => {
    setActiveRule(rule)
    setName(rule.name)
    setRuleCode(rule.rule_code || "")
    setDescription(rule.description || "")
    setHardwareMarkup(rule.hardware_markup_pct)
    setStaffingMarkup(rule.staffing_markup_pct)
    setManagementFee(rule.management_fee_pct)
    setContingency(rule.contingency_pct)
    setGst(rule.gst_pct)
    setIsDefault(rule.is_default)
    setIsActive(rule.is_active)
    setIsEditing(true)
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const payload = {
      name,
      rule_code: ruleCode || undefined,
      description,
      hardware_markup_pct: Number(hardwareMarkup),
      staffing_markup_pct: Number(staffingMarkup),
      management_fee_pct: Number(managementFee),
      contingency_pct: Number(contingency),
      gst_pct: Number(gst),
      is_default: isDefault,
      is_active: isActive,
    }

    try {
      if (isEditing && activeRule) {
        await updateRule.mutateAsync({ id: activeRule.id, ...payload })
      } else {
        await createRule.mutateAsync(payload)
      }
      setShowForm(false)
      refetch()
    } catch {
      // toast.error is handled by the hook
    }
  }

  return (
    <PageContainer>
      <SectionHeader
        title="Pricing & Margin Rules"
        description="Configure baseline markup rates, contingency buffers, management fees, and default tax policies used by the Pricing Simulator."
        actions={
          <div className="flex gap-2">
            <Button onClick={() => refetch()} variant="outline" className="h-9 gap-1 text-xs">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
            <Button onClick={handleOpenCreate} className="h-9 gap-1 text-xs bg-brand-primary text-primary hover:bg-brand-primary/90">
              <Plus className="h-3.5 w-3.5" /> Create Rule Set
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 mt-6">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-secondary flex items-center justify-center gap-2 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl">
            <RefreshCw className="animate-spin h-4 w-4" /> Loading margin rules...
          </div>
        ) : rules.length === 0 ? (
          <div className="p-16 text-center text-tertiary text-xs flex flex-col items-center justify-center gap-2 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl">
            <Sliders className="h-8 w-8 text-border-hover mb-2" />
            <span>No pricing rule configurations found. Create one to begin.</span>
          </div>
        ) : (
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-surface-2 border-b border-border text-secondary font-bold uppercase text-[10px]">
                  <th className="p-4">Rule Name</th>
                  <th className="p-4 text-center">Hardware Markup</th>
                  <th className="p-4 text-center">Staffing Markup</th>
                  <th className="p-4 text-center">Mgmt Fee</th>
                  <th className="p-4 text-center">Contingency</th>
                  <th className="p-4 text-center">GST Tax</th>
                  <th className="p-4 text-center">Default</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} className="border-b border-border/40 hover:bg-surface-hover/20">
                    <td className="p-4">
                      <div className="space-y-1">
                        <div className="font-semibold text-primary flex items-center gap-2">
                          {rule.name}
                          {rule.is_default && (
                            <span className="text-[9px] font-extrabold uppercase bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full">
                              Active Default
                            </span>
                          )}
                        </div>
                        {rule.description && (
                          <div className="text-[10px] text-tertiary">{rule.description}</div>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-center font-mono font-medium text-secondary">{rule.hardware_markup_pct}%</td>
                    <td className="p-4 text-center font-mono font-medium text-secondary">{rule.staffing_markup_pct}%</td>
                    <td className="p-4 text-center font-mono font-medium text-secondary">{rule.management_fee_pct}%</td>
                    <td className="p-4 text-center font-mono font-medium text-secondary">{rule.contingency_pct}%</td>
                    <td className="p-4 text-center font-mono font-medium text-secondary">{rule.gst_pct}%</td>
                    <td className="p-4 text-center">
                      <span className={rule.is_default ? "text-success font-semibold" : "text-tertiary"}>
                        {rule.is_default ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full font-bold uppercase text-[9px] ${
                        rule.is_active
                          ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                          : "bg-red-500/10 border border-red-500/20 text-red-400"
                      }`}>
                        {rule.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <Button size="sm" variant="outline" onClick={() => handleOpenEdit(rule)} className="h-8 text-xs font-semibold gap-1">
                        <Pencil className="h-3 w-3" /> Edit Config
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Slideout Configuration Panel */}
      <Sheet open={showForm} onOpenChange={setShowForm}>
        <SheetContent className="bg-[var(--bg-surface)] border-[var(--border-default)] w-[480px] sm:max-w-[480px]">
          <SheetHeader className="border-b border-border pb-4 mb-6">
            <SheetTitle className="text-primary font-bold">{isEditing ? "Modify Margin Rule Set" : "Create Margin Rule Set"}</SheetTitle>
            <SheetDescription className="text-secondary text-xs">
              Define the percentage-based rules for calculating final pricing totals in EventX quoting flows.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-secondary">Configuration Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Standard Margin FY27" className="bg-surface-2 border-border" />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-secondary">Rule Code Identifier</label>
              <Input value={ruleCode} onChange={(e) => setRuleCode(e.target.value)} placeholder="e.g. RULE_STANDARD_FY27" className="bg-surface-2 border-border font-mono uppercase" />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-secondary">Description</label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Provide context on margins deployment eligibility" className="bg-surface-2 border-border min-h-[60px]" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-secondary">Hardware Markup %</label>
                <div className="relative">
                  <Input type="number" min="0" max="100" value={hardwareMarkup} onChange={(e) => setHardwareMarkup(Number(e.target.value))} required className="bg-surface-2 border-border pr-8" />
                  <Percent className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-tertiary" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-secondary">Staffing Markup %</label>
                <div className="relative">
                  <Input type="number" min="0" max="100" value={staffingMarkup} onChange={(e) => setStaffingMarkup(Number(e.target.value))} required className="bg-surface-2 border-border pr-8" />
                  <Percent className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-tertiary" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-secondary">Mgmt Fee %</label>
                <div className="relative">
                  <Input type="number" min="0" max="100" value={managementFee} onChange={(e) => setManagementFee(Number(e.target.value))} required className="bg-surface-2 border-border pr-8" />
                  <Percent className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-tertiary" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-secondary">Contingency %</label>
                <div className="relative">
                  <Input type="number" min="0" max="100" value={contingency} onChange={(e) => setContingency(Number(e.target.value))} required className="bg-surface-2 border-border pr-8" />
                  <Percent className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-tertiary" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-secondary">GST / Taxes %</label>
                <div className="relative">
                  <Input type="number" min="0" max="100" value={gst} onChange={(e) => setGst(Number(e.target.value))} required className="bg-surface-2 border-border pr-8" />
                  <Percent className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-tertiary" />
                </div>
              </div>
            </div>

            <div className="pt-2 space-y-3">
              <div className="flex items-center justify-between bg-surface-2/20 border border-border/50 rounded-xl p-3">
                <div>
                  <p className="font-semibold text-primary">Make Active Default</p>
                  <p className="text-[10px] text-tertiary">If selected, simulator will use these percentages by default.</p>
                </div>
                <Switch checked={isDefault} onCheckedChange={setIsDefault} />
              </div>

              <div className="flex items-center justify-between bg-surface-2/20 border border-border/50 rounded-xl p-3">
                <div>
                  <p className="font-semibold text-primary">Configuration Status</p>
                  <p className="text-[10px] text-tertiary">Disable to prevent this rule set from being referenced.</p>
                </div>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-4 mt-6">
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)} className="h-9 text-xs">
                Cancel
              </Button>
              <Button type="submit" className="h-9 text-xs bg-brand-primary text-primary hover:bg-brand-primary/90 font-bold" disabled={createRule.isPending || updateRule.isPending}>
                {isEditing ? "Save Configuration" : "Create Configuration"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </PageContainer>
  )
}
