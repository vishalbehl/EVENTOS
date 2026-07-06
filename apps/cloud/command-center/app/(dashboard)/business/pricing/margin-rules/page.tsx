"use client";

import { useMemo, useState } from "react";
import { 
  usePricingRules, 
  useUpdatePricingRule, 
  useCreatePricingRule,
  PricingRule 
} from "@/services/super-admin-service";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { 
  Percent, ShieldCheck, Plus, Pencil, Save, 
  SlidersHorizontal, Check, RefreshCw 
} from "lucide-react";
import { toast } from "sonner";

export default function MarginRulesPage() {
  const { data: rules = [], isLoading, refetch } = usePricingRules();
  const updateRuleMutation = useUpdatePricingRule();
  const createRuleMutation = useCreatePricingRule();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<PricingRule>>({});
  const [isAdding, setIsAdding] = useState(false);

  const handleEdit = (rule: PricingRule) => {
    setEditingId(rule.id);
    setFormData(rule);
  };

  const handleSave = async (id: string) => {
    try {
      await updateRuleMutation.mutateAsync({
        id,
        name: formData.name,
        hardware_markup_pct: Number(formData.hardware_markup_pct),
        staffing_markup_pct: Number(formData.staffing_markup_pct),
        management_fee_pct: Number(formData.management_fee_pct),
        contingency_pct: Number(formData.contingency_pct),
        gst_pct: Number(formData.gst_pct),
        description: formData.description || ""
      });
      toast.success("Pricing rule updated successfully");
      setEditingId(null);
      refetch();
    } catch (e: any) {
      toast.error(e.message || "Failed to update pricing rule");
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createRuleMutation.mutateAsync({
        name: formData.name || "New Rule",
        hardware_markup_pct: Number(formData.hardware_markup_pct || 15),
        staffing_markup_pct: Number(formData.staffing_markup_pct || 20),
        management_fee_pct: Number(formData.management_fee_pct || 10),
        contingency_pct: Number(formData.contingency_pct || 5),
        gst_pct: Number(formData.gst_pct || 18),
        is_default: false,
        description: formData.description || ""
      });
      toast.success("Pricing rule created successfully");
      setIsAdding(false);
      setFormData({});
      refetch();
    } catch (e: any) {
      toast.error(e.message || "Failed to create pricing rule");
    }
  };

  return (
    <PageContainer>
      <div className="flex justify-between items-center mb-6">
        <SectionHeader
          title="Margin & Pricing Rules"
          description="Configure markup multipliers, management fees, contingencies, and tax rates for simulations."
        />
        <Button 
          onClick={() => { setIsAdding(true); setFormData({}); }}
          className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs gap-1.5 rounded-xl px-4 py-2"
        >
          <Plus className="h-4 w-4" /> Add Custom Rule
        </Button>
      </div>

      {isAdding && (
        <Card className="p-6 bg-[#0e0d16]/90 border border-purple-500/20 mb-8 rounded-3xl">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <Plus className="h-4 w-4 text-purple-400" /> New Markup Configuration
          </h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-white/50">Rule Name</label>
                <Input 
                  value={formData.name || ""}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Corporate Standard Tier"
                  className="bg-white/3 border-white/10 text-white rounded-xl text-xs h-10"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-white/50">Description</label>
                <Input 
                  value={formData.description || ""}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="e.g., Standard markups for domestic events"
                  className="bg-white/3 border-white/10 text-white rounded-xl text-xs h-10"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-white/50">Hardware Markup %</label>
                <Input 
                  type="number"
                  value={formData.hardware_markup_pct ?? 15}
                  onChange={(e) => setFormData({ ...formData, hardware_markup_pct: Number(e.target.value) })}
                  className="bg-white/3 border-white/10 text-white rounded-xl text-xs h-10"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-white/50">Staffing Markup %</label>
                <Input 
                  type="number"
                  value={formData.staffing_markup_pct ?? 20}
                  onChange={(e) => setFormData({ ...formData, staffing_markup_pct: Number(e.target.value) })}
                  className="bg-white/3 border-white/10 text-white rounded-xl text-xs h-10"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-white/50">Management Fee %</label>
                <Input 
                  type="number"
                  value={formData.management_fee_pct ?? 10}
                  onChange={(e) => setFormData({ ...formData, management_fee_pct: Number(e.target.value) })}
                  className="bg-white/3 border-white/10 text-white rounded-xl text-xs h-10"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-white/50">Contingency %</label>
                <Input 
                  type="number"
                  value={formData.contingency_pct ?? 5}
                  onChange={(e) => setFormData({ ...formData, contingency_pct: Number(e.target.value) })}
                  className="bg-white/3 border-white/10 text-white rounded-xl text-xs h-10"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-white/50">GST Tax %</label>
                <Input 
                  type="number"
                  value={formData.gst_pct ?? 18}
                  onChange={(e) => setFormData({ ...formData, gst_pct: Number(e.target.value) })}
                  className="bg-white/3 border-white/10 text-white rounded-xl text-xs h-10"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button 
                type="button" 
                onClick={() => setIsAdding(false)} 
                className="bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold px-4 h-9 border-0"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold px-4 h-9"
              >
                Create Rule
              </Button>
            </div>
          </form>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <RefreshCw className="h-6 w-6 text-purple-400 animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          {rules.map((rule) => {
            const isEditing = editingId === rule.id;
            return (
              <Card key={rule.id} className="p-6 bg-[#0e0d16]/70 border border-white/5 rounded-3xl relative overflow-hidden">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                  <div>
                    {isEditing ? (
                      <Input 
                        value={formData.name || ""}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="bg-white/3 border-white/10 text-white rounded-xl text-sm font-bold h-9 w-64"
                      />
                    ) : (
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        {rule.name}
                        {rule.is_default && (
                          <span className="bg-purple-500/10 text-purple-400 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-purple-500/25">
                            Default Active
                          </span>
                        )}
                      </h4>
                    )}
                    {isEditing ? (
                      <Input 
                        value={formData.description || ""}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        className="bg-white/3 border-white/10 text-white rounded-xl text-xs h-8 w-96 mt-2"
                        placeholder="Description"
                      />
                    ) : (
                      <p className="text-xs text-white/50 mt-1">{rule.description || "No description provided."}</p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {isEditing ? (
                      <>
                        <Button 
                          onClick={() => setEditingId(null)}
                          className="bg-white/5 hover:bg-white/10 text-white text-xs font-bold px-3.5 py-1.5 rounded-xl border-0 h-8"
                        >
                          Cancel
                        </Button>
                        <Button 
                          onClick={() => handleSave(rule.id)}
                          className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-3.5 py-1.5 rounded-xl h-8 flex items-center gap-1"
                        >
                          <Save className="h-3.5 w-3.5" /> Save Changes
                        </Button>
                      </>
                    ) : (
                      <Button 
                        onClick={() => handleEdit(rule)}
                        className="bg-white/5 hover:bg-white/10 text-white text-xs font-bold px-3.5 py-1.5 rounded-xl border-0 h-8 flex items-center gap-1"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit Parameters
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                  <div className="p-4 rounded-2xl bg-white/3 border border-white/5 text-center">
                    <span className="block text-[9px] font-black uppercase tracking-wider text-white/40 mb-1">Hardware Markup</span>
                    {isEditing ? (
                      <Input 
                        type="number"
                        value={formData.hardware_markup_pct ?? 0}
                        onChange={(e) => setFormData({ ...formData, hardware_markup_pct: Number(e.target.value) })}
                        className="bg-white/3 border-white/10 text-white text-center rounded-xl text-xs h-8"
                      />
                    ) : (
                      <span className="text-lg font-black text-white flex items-center justify-center gap-0.5">
                        {rule.hardware_markup_pct}%
                      </span>
                    )}
                  </div>

                  <div className="p-4 rounded-2xl bg-white/3 border border-white/5 text-center">
                    <span className="block text-[9px] font-black uppercase tracking-wider text-white/40 mb-1">Staffing Markup</span>
                    {isEditing ? (
                      <Input 
                        type="number"
                        value={formData.staffing_markup_pct ?? 0}
                        onChange={(e) => setFormData({ ...formData, staffing_markup_pct: Number(e.target.value) })}
                        className="bg-white/3 border-white/10 text-white text-center rounded-xl text-xs h-8"
                      />
                    ) : (
                      <span className="text-lg font-black text-white flex items-center justify-center gap-0.5">
                        {rule.staffing_markup_pct}%
                      </span>
                    )}
                  </div>

                  <div className="p-4 rounded-2xl bg-white/3 border border-white/5 text-center">
                    <span className="block text-[9px] font-black uppercase tracking-wider text-white/40 mb-1">Management Fee</span>
                    {isEditing ? (
                      <Input 
                        type="number"
                        value={formData.management_fee_pct ?? 0}
                        onChange={(e) => setFormData({ ...formData, management_fee_pct: Number(e.target.value) })}
                        className="bg-white/3 border-white/10 text-white text-center rounded-xl text-xs h-8"
                      />
                    ) : (
                      <span className="text-lg font-black text-white flex items-center justify-center gap-0.5">
                        {rule.management_fee_pct}%
                      </span>
                    )}
                  </div>

                  <div className="p-4 rounded-2xl bg-white/3 border border-white/5 text-center">
                    <span className="block text-[9px] font-black uppercase tracking-wider text-white/40 mb-1">Contingency</span>
                    {isEditing ? (
                      <Input 
                        type="number"
                        value={formData.contingency_pct ?? 0}
                        onChange={(e) => setFormData({ ...formData, contingency_pct: Number(e.target.value) })}
                        className="bg-white/3 border-white/10 text-white text-center rounded-xl text-xs h-8"
                      />
                    ) : (
                      <span className="text-lg font-black text-white flex items-center justify-center gap-0.5">
                        {rule.contingency_pct}%
                      </span>
                    )}
                  </div>

                  <div className="p-4 rounded-2xl bg-white/3 border border-white/5 text-center col-span-2 sm:col-span-1">
                    <span className="block text-[9px] font-black uppercase tracking-wider text-white/40 mb-1">GST Rate</span>
                    {isEditing ? (
                      <Input 
                        type="number"
                        value={formData.gst_pct ?? 0}
                        onChange={(e) => setFormData({ ...formData, gst_pct: Number(e.target.value) })}
                        className="bg-white/3 border-white/10 text-white text-center rounded-xl text-xs h-8"
                      />
                    ) : (
                      <span className="text-lg font-black text-white flex items-center justify-center gap-0.5">
                        {rule.gst_pct}%
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
