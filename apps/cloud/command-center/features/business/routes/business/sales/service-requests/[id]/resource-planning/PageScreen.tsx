"use client"

import { useState, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { 
  useServiceRequestOverview, useServiceRequestPlanning, 
  useRecalculateServiceRequestPlanning, useUpdateHardwareQuantity, 
  useUpdateStaffQuantity 
} from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  ArrowLeft, RefreshCw, Eye, Download, Users, Cpu, 
  Wallet, Layers, Map, Wifi, Sparkles, ChevronRight 
} from "lucide-react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import { formatLakhRupee } from "@/lib/formatters"
import { toast } from "sonner"

export default function ResourcePlanningPage() {
  const router = useRouter()
  const params = useParams()
  const requestId = params.id as string

  // Fetch API data
  const { data: overview } = useServiceRequestOverview(requestId)
  const { data: plan, refetch: refetchPlan } = useServiceRequestPlanning(requestId)

  const recalculateMutation = useRecalculateServiceRequestPlanning(requestId)
  const updateHardwareMutation = useUpdateHardwareQuantity(requestId)
  const updateStaffMutation = useUpdateStaffQuantity(requestId)

  const [activePlanningTab, setActivePlanningTab] = useState<string>("hardware")

  const summary = plan?.summary || {
    hardware_total: 0,
    staff_total: 0,
    logistics: 0,
    contingency: 0,
    estimated_cost: 0
  }
  const hardware = plan?.hardware || []
  const staff = plan?.staff || []
  const donutChart = plan?.donut_chart || []

  // Recalculate
  const handleRecalculate = async () => {
    await recalculateMutation.mutateAsync()
    refetchPlan()
  }

  // Update hardware quantity inline
  const handleUpdateHardwareQty = async (hwId: string, qty: number) => {
    if (qty < 0) return
    await updateHardwareMutation.mutateAsync({ id: hwId, quantity: qty })
    refetchPlan()
  }

  // Update staff quantity / days inline
  const handleUpdateStaff = async (stId: string, qty: number, days: number) => {
    if (qty < 0 || days < 0) return
    await updateStaffMutation.mutateAsync({ id: stId, quantity: qty, days })
    refetchPlan()
  }

  // Pie chart cost data
  const COLORS = ["#8B5CF6", "#3B82F6", "#F59E0B"]

  const handleExportPlan = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + ["Resource Name,Quantity,Total Cost", 
         ...hardware.map((h: any) => `"${h.item_name}","${h.quantity}","${h.total_cost}"`),
         ...staff.map((s: any) => `"${s.role}","${s.quantity}","${s.total_cost}"`)
        ].join("\n")
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `Resource_Plan_${requestId}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <PageContainer>
      {/* Header & Breadcrumbs */}
      <div className="flex flex-col gap-3 mb-6">
        <div className="flex items-center gap-2 text-xs text-tertiary">
          <span className="hover:text-primary cursor-pointer" onClick={() => router.push("/service-requests")}>Service Requests</span>
          <ChevronRight className="h-3 w-3" />
          <span className="hover:text-primary cursor-pointer font-bold text-secondary" onClick={() => router.push(`/service-requests/${requestId}`)}>{overview?.request_number || "REQ-..."}</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-primary font-extrabold uppercase tracking-wide">Resource Planning</span>
        </div>

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h1 className="text-xl font-black text-primary flex items-center gap-2">
              <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg" onClick={() => router.push(`/service-requests/${requestId}`)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              Resource Allocation Planning
            </h1>
            <p className="text-[10px] text-tertiary">Provision hardware hardware assets, staff crew counts, and optimize event logistics</p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={handleRecalculate}
              variant="outline"
              size="sm"
              className="text-xs h-9 gap-1 text-secondary border-border bg-surface-2"
            >
              <RefreshCw className="h-3.5 w-3.5 text-brand-primary" /> Recalculate Plan
            </Button>
            <Button
              onClick={() => router.push(`/service-requests/${requestId}`)}
              variant="outline"
              size="sm"
              className="text-xs h-9 gap-1 text-secondary border-border bg-surface-2"
            >
              <Eye className="h-3.5 w-3.5 text-secondary" /> View Quote
            </Button>
            <Button
              onClick={handleExportPlan}
              variant="outline"
              size="sm"
              className="text-xs h-9 gap-1 text-secondary border-border bg-surface-2"
            >
              <Download className="h-3.5 w-3.5" /> Export Plan
            </Button>
          </div>
        </div>
      </div>

      {/* Top Summary Strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        
        {/* Card 1: Requirements Summary */}
        <Card className="p-5 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-default)] flex flex-col justify-between h-36">
          <div className="flex justify-between items-center">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary">Requirements Summary</span>
            <Layers className="h-4 w-4 text-brand-primary" />
          </div>
          <div className="space-y-1.5 pt-2 text-[10px] text-secondary font-bold">
            <div className="flex justify-between">
              <span>Attendees:</span>
              <span className="text-primary">{overview?.attendees_count ?? 1200} pax</span>
            </div>
            <div className="flex justify-between">
              <span>Halls & Rooms:</span>
              <span className="text-primary">{overview?.total_rooms ?? 6} rooms</span>
            </div>
            <div className="flex justify-between">
              <span>Check-in Counters:</span>
              <span className="text-primary">4 Counters</span>
            </div>
          </div>
        </Card>

        {/* Card 2: Resource Summary */}
        <Card className="p-5 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-default)] flex flex-col justify-between h-36">
          <div className="flex justify-between items-center">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary">Resource Assets Count</span>
            <Cpu className="h-4 w-4 text-brand-primary" />
          </div>
          <div className="space-y-2 pt-2 text-xs">
            <div className="flex justify-between items-baseline">
              <span className="text-[10px] text-tertiary">Hardware Items:</span>
              <span 
                className="font-bold text-brand-primary hover:underline cursor-pointer"
                onClick={() => setActivePlanningTab("hardware")}
              >
                {hardware.length} Sourced
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-[10px] text-tertiary">Crew headcount:</span>
              <span 
                className="font-bold text-brand-primary hover:underline cursor-pointer"
                onClick={() => setActivePlanningTab("staff")}
              >
                {staff.reduce((acc: number, cur: any) => acc + cur.quantity, 0)} Crew
              </span>
            </div>
          </div>
        </Card>

        {/* Card 3: Estimated Cost */}
        <Card className="p-5 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-default)] flex flex-col justify-between h-36">
          <div className="flex justify-between items-center">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary">Estimated Allocation Cost</span>
            <Wallet className="h-4 w-4 text-success" />
          </div>
          <div className="space-y-1 pt-2">
            <span className="text-xl font-black font-mono text-primary block">{formatLakhRupee(summary.estimated_cost)}</span>
            <span className="text-[9px] text-tertiary font-semibold block">Sum of Hardware, Staffing & Logistics</span>
          </div>
        </Card>

        {/* Card 4: Cost Breakdown Donut Chart */}
        <Card className="p-5 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-default)] flex items-center justify-between h-36">
          <div className="h-full w-24 relative flex items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutChart}
                  cx="50%"
                  cy="50%"
                  innerRadius={22}
                  outerRadius={34}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {donutChart.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => `₹${v.toLocaleString()}`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1 text-[8px] font-bold text-secondary flex-1 pl-3">
            {donutChart.map((item: any, idx: number) => (
              <div key={idx} className="flex justify-between items-center">
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                  <span className="truncate max-w-[80px]">{item.name}</span>
                </span>
                <span className="font-mono text-primary">{formatLakhRupee(item.value)}</span>
              </div>
            ))}
          </div>
        </Card>

      </div>

      {/* Tabs Allocation Sheet */}
      <Tabs value={activePlanningTab} onValueChange={setActivePlanningTab} className="space-y-6">
        <TabsList className="bg-surface-2 border border-border w-full flex justify-start rounded-xl">
          <TabsTrigger value="hardware" className="text-xs font-bold px-4 py-2 border-b-2 border-transparent data-[state=active]:border-brand-primary">
            Hardware Allocation
          </TabsTrigger>
          <TabsTrigger value="staff" className="text-xs font-bold px-4 py-2 border-b-2 border-transparent data-[state=active]:border-brand-primary">
            Staffing Plan
          </TabsTrigger>
          <TabsTrigger value="room" className="text-xs font-bold px-4 py-2 border-b-2 border-transparent data-[state=active]:border-brand-primary">
            Room Mapping
          </TabsTrigger>
          <TabsTrigger value="network" className="text-xs font-bold px-4 py-2 border-b-2 border-transparent data-[state=active]:border-brand-primary">
            Network Plan
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Hardware */}
        <TabsContent value="hardware" className="space-y-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-surface-2 border-b border-border text-secondary">
                  <th className="p-3">Category</th>
                  <th className="p-3">Item Name</th>
                  <th className="p-3">Specification</th>
                  <th className="p-3 text-center w-24">Quantity</th>
                  <th className="p-3 text-right">Unit Cost</th>
                  <th className="p-3 text-right">Total Cost</th>
                </tr>
              </thead>
              <tbody>
                {hardware.map((item: any) => (
                  <tr key={item.id} className="border-b border-border/40 hover:bg-surface-hover/20 font-semibold text-secondary">
                    <td className="p-3 text-brand-primary text-[10px] uppercase font-bold">{item.category}</td>
                    <td className="p-3 text-primary">{item.item_name}</td>
                    <td className="p-3 text-tertiary text-[10px] font-medium">{item.specification}</td>
                    <td className="p-3 text-center">
                      <Input
                        type="number"
                        min="0"
                        value={item.quantity}
                        onChange={e => handleUpdateHardwareQty(item.id, parseInt(e.target.value) || 0)}
                        className="h-7 w-16 text-center text-xs bg-surface-2 border-border font-mono mx-auto"
                      />
                    </td>
                    <td className="p-3 text-right font-mono text-tertiary">₹{item.unit_cost.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono text-primary font-bold">₹{item.total_cost.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Tab 2: Staffing Plan */}
        <TabsContent value="staff" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            <div className="lg:col-span-9 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl overflow-hidden h-fit">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-surface-2 border-b border-border text-secondary">
                    <th className="p-3">Crew Role</th>
                    <th className="p-3 text-center w-24">Headcount</th>
                    <th className="p-3 text-center w-24">Event Days</th>
                    <th className="p-3 text-right">Cost Per Day</th>
                    <th className="p-3 text-right">Total Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((st: any) => (
                    <tr key={st.id} className="border-b border-border/40 hover:bg-surface-hover/20 font-semibold text-secondary">
                      <td className="p-3 text-primary">{st.role}</td>
                      <td className="p-3 text-center">
                        <Input
                          type="number"
                          min="0"
                          value={st.quantity}
                          onChange={e => handleUpdateStaff(st.id, parseInt(e.target.value) || 0, st.days)}
                          className="h-7 w-16 text-center text-xs bg-surface-2 border-border font-mono mx-auto"
                        />
                      </td>
                      <td className="p-3 text-center">
                        <Input
                          type="number"
                          min="0"
                          value={st.days}
                          onChange={e => handleUpdateStaff(st.id, st.quantity, parseInt(e.target.value) || 0)}
                          className="h-7 w-16 text-center text-xs bg-surface-2 border-border font-mono mx-auto"
                        />
                      </td>
                      <td className="p-3 text-right font-mono text-tertiary">₹{st.cost_per_day.toLocaleString()}</td>
                      <td className="p-3 text-right font-mono text-primary font-bold">₹{st.total_cost.toLocaleString()}</td>
                    </tr>
                  ))}
                  <tr className="bg-surface-2 font-extrabold text-primary">
                    <td colSpan={4} className="p-3 text-right text-xs">Total Staff Crew Budget:</td>
                    <td className="p-3 text-right font-mono text-xs">
                      ₹{staff.reduce((acc: number, cur: any) => acc + cur.total_cost, 0).toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Right sidebar crew overview */}
            <div className="lg:col-span-3 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-5 space-y-4">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block">Role Breakdown</span>
              <div className="space-y-3">
                {staff.map((st: any) => (
                  <div key={st.id} className="flex justify-between items-center p-2.5 rounded-xl bg-surface-2 border border-border/40">
                    <span className="text-[10px] text-primary font-bold max-w-[130px] truncate">{st.role}</span>
                    <Badge className="text-[9px] bg-brand-primary/10 border-brand-primary/20 text-brand-primary border">
                      {st.quantity} Staff ({st.days}d)
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </TabsContent>

        {/* Tab 3: Room Mapping */}
        <TabsContent value="room" className="space-y-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-6">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block mb-4 flex items-center gap-1.5">
              <Map className="h-4 w-4 text-brand-primary" /> Presentation Room Physical Mapping
            </span>
            <div className="border border-border/40 rounded-2xl overflow-hidden text-xs">
              <div className="bg-surface-2 p-3 font-bold border-b border-border text-secondary grid grid-cols-3">
                <span>Requested Room Spec</span>
                <span>Assigned Venue Location</span>
                <span>Operational Status</span>
              </div>
              <div className="p-3 border-b border-border/20 grid grid-cols-3 items-center">
                <span className="font-bold text-primary">Main Plenary Hall (1200 Seating)</span>
                <span className="text-secondary">Grand Ballroom Suite A+B</span>
                <span className="text-success font-bold">Allocated & Locked</span>
              </div>
              <div className="p-3 border-b border-border/20 grid grid-cols-3 items-center">
                <span className="font-bold text-primary">Parallel Room 1 (200 Seating)</span>
                <span className="text-secondary">Meeting Room 104</span>
                <span className="text-success font-bold">Allocated & Locked</span>
              </div>
              <div className="p-3 grid grid-cols-3 items-center">
                <span className="font-bold text-primary">Speaker Briefing Zone (50 Seating)</span>
                <span className="text-secondary">VIP Lounge West</span>
                <span className="text-amber-500 font-bold">Pending Confirmation</span>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Tab 4: Network Plan */}
        <TabsContent value="network" className="space-y-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-6">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block mb-4 flex items-center gap-1.5">
              <Wifi className="h-4 w-4 text-brand-primary" /> High-Density Networking Topology
            </span>
            <div className="border border-border/40 rounded-2xl p-4 bg-surface-2/40 space-y-3 text-xs text-secondary leading-relaxed">
              <p><strong>Primary ISP Link:</strong> Dedicated 1 Gbps symmetric fiber connection mapped to Grand Ballroom.</p>
              <p><strong>Backup ISP Link:</strong> High-bandwidth 200 Mbps redundant microwave wireless bridge node.</p>
              <p><strong>Active Nodes:</strong> 12 Dual-band Wi-Fi 6 wireless access points deployed across Registration Counters and Main Plenary areas.</p>
            </div>
          </div>
        </TabsContent>

      </Tabs>
    </PageContainer>
  )
}
