"use client"
import { useState, useEffect, useMemo } from "react"
import { useStaffCatalog, useCreateStaffRole, useUpdateStaffRole, useImportStaffExcel, formatINR } from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader"
import { MetricRow } from "@/components/super-admin/ui/MetricRow"
import { DataTable } from "@/components/super-admin/ui/DataTable"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Users, Plus, Search, FileSpreadsheet, SlidersHorizontal, RotateCcw, X, Upload } from "lucide-react"
import { useDebounce } from "@/hooks/use-debounce"
import { useReactTable, getCoreRowModel } from "@tanstack/react-table"
import { useDropzone } from "react-dropzone"

export default function StaffCatalogPage() {
  const [search, setSearch] = useState("")
  const [departmentFilter, setDepartmentFilter] = useState<string>("")
  const [gradeFilter, setGradeFilter] = useState<string>("")
  const [page, setPage] = useState(0)
  const [showCreatePanel, setShowCreatePanel] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const [editingItem, setEditingItem] = useState<any>(null)
  const limit = 20

  const debouncedSearch = useDebounce(search, 300)

  const { data, isLoading } = useStaffCatalog({
    search: debouncedSearch || undefined,
    skip: page * limit,
    limit,
  })
  const createItem = useCreateStaffRole()
  const updateItem = useUpdateStaffRole()
  const importExcel = useImportStaffExcel()

  const summary = data?.summary

  // Filtered Items
  const items = useMemo(() => {
    let list = data?.items ?? []
    if (departmentFilter) {
      list = list.filter(item => (item.team_category || item.department) === departmentFilter)
    }
    if (gradeFilter) {
      list = list.filter(item => item.grade === gradeFilter)
    }
    return list
  }, [data?.items, departmentFilter, gradeFilter])

  // Client-side CSV Exporter
  const handleExportCSV = () => {
    if (!items) return
    const headers = ["Role Code", "Role Name", "Team Category", "Grade", "Cost Per Day", "Selling Per Day", "Margin %", "Availability", "Status"]
    const rows = items.map(item => [
      item.role_code,
      item.name,
      item.team_category || item.department || "General Operations",
      item.grade,
      item.cost_per_day,
      item.selling_per_day,
      item.margin_pct.toFixed(2),
      item.available_count ?? 10,
      item.status
    ])
    
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${val}"`).join(","))].join("\n")
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", "staff_catalog_export.csv")
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const columns = useMemo(() => [
    {
      accessorKey: "role_code",
      header: "Role Code",
      cell: ({ row }: any) => (
        <span className="font-mono text-xs font-bold text-brand-primary">
          {row.original.role_code}
        </span>
      )
    },
    {
      accessorKey: "name",
      header: "Role Name",
      cell: ({ row }: any) => (
        <span className="text-xs font-semibold text-primary block">
          {row.original.name}
        </span>
      )
    },
    {
      accessorKey: "team_category",
      header: "Team Category",
      cell: ({ row }: any) => (
        <span className="text-xs text-secondary font-medium block">
          {row.original.team_category || row.original.department || "General Operations"}
        </span>
      )
    },
    {
      accessorKey: "grade",
      header: "Grade",
      cell: ({ row }: any) => (
        <Badge variant="outline" className="text-[10px] bg-surface-2 border-border-subtle font-mono font-bold">
          {row.original.grade || "L1"}
        </Badge>
      )
    },
    {
      accessorKey: "cost_per_day",
      header: "Cost/Day (₹)",
      cell: ({ row }: any) => (
        <span className="text-xs font-mono text-secondary">
          {formatINR(row.original.cost_per_day)}
        </span>
      )
    },
    {
      accessorKey: "selling_per_day",
      header: "Selling/Day (₹)",
      cell: ({ row }: any) => (
        <span className="text-xs font-mono text-success font-semibold">
          {formatINR(row.original.selling_per_day)}
        </span>
      )
    },
    {
      accessorKey: "margin_pct",
      header: "Margin %",
      cell: ({ row }: any) => (
        <span className={`text-xs font-mono font-semibold
          ${row.original.margin_pct > 50 ? 'text-success'
            : row.original.margin_pct >= 30 ? 'text-warning'
            : 'text-danger'}`}>
          {row.original.margin_pct?.toFixed(1)}%
        </span>
      )
    },
    {
      accessorKey: "available_count",
      header: "Availability",
      cell: ({ row }: any) => (
        <span className="text-xs text-secondary font-mono">
          {row.original.available_count ?? 10} available
        </span>
      )
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }: any) => (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border
          ${row.original.status === 'ACTIVE'
            ? 'bg-success-muted/20 text-success border-success/30'
            : 'bg-surface-2 text-tertiary border-border'}`}>
          {row.original.status === 'ACTIVE' ? '● Active' : '○ Inactive'}
        </span>
      )
    },
    {
      id: "actions",
      cell: ({ row }: any) => (
        <Button
          size="sm" variant="ghost"
          onClick={() => setEditingItem(row.original)}
          className="text-xs text-secondary hover:text-primary h-8 px-2"
        >
          Edit
        </Button>
      )
    }
  ], [])

  const table = useReactTable({
    data: items,
    columns,
    pageCount: Math.ceil((data?.total ?? 0) / limit),
    state: {
      pagination: {
        pageIndex: page,
        pageSize: limit
      }
    },
    onPaginationChange: (updater: any) => {
      const nextVal = typeof updater === 'function' ? updater({ pageIndex: page, pageSize: limit }) : updater
      setPage(nextVal.pageIndex)
    },
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
  })

  const resetFilters = () => {
    setDepartmentFilter("")
    setGradeFilter("")
    setPage(0)
  }

  const activeFiltersCount = useMemo(() => {
    let cnt = 0
    if (departmentFilter) cnt++
    if (gradeFilter) cnt++
    return cnt
  }, [departmentFilter, gradeFilter])

  return (
    <PageContainer>
      <SectionHeader
        title="Staff Catalog"
        description="Manage staff roles, rates and availability"
        actions={
          <div className="flex gap-2">
            <Button
              onClick={() => setShowImportModal(true)}
              variant="outline"
              className="border-border text-secondary gap-2 h-9 text-xs"
            >
              <Upload className="h-4 w-4" />
              Import Excel
            </Button>
            <Button
              onClick={handleExportCSV}
              variant="outline"
              className="border-border text-secondary gap-2 h-9 text-xs"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Export CSV
            </Button>
            <Button
              onClick={() => setShowCreatePanel(true)}
              className="bg-brand-primary hover:bg-brand-primary/90 text-white gap-2 h-9 text-xs font-bold"
            >
              <Plus className="h-4 w-4" />
              Add Staff Role
            </Button>
          </div>
        }
      />

      {/* KPI Cards */}
      <MetricRow metrics={[
        { label: 'Total Staff Roles', value: summary?.total_roles ?? 0 },
        { label: 'Active Roles', value: summary?.active_roles ?? 0 },
        { label: 'Avg Cost Per Day',
          value: formatINR(summary?.avg_cost_per_day ?? 0) },
        { label: 'Avg Selling Per Day',
          value: formatINR(summary?.avg_selling_per_day ?? 0) },
        { label: 'Total Staff Deployed', value: summary?.total_staff_deployed ?? 0 },
        { label: 'Monthly Staff Cost', value: formatINR((summary?.avg_cost_per_day ?? 0) * 10 * 30) },
      ]} />

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[var(--bg-surface)] border border-[var(--border-default)] p-4 rounded-2xl">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-tertiary" />
          <Input
            placeholder="Search roles, code..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
            className="pl-9 bg-surface-2 border-border h-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          {activeFiltersCount > 0 && (
            <Button
              variant="ghost"
              onClick={resetFilters}
              className="text-xs h-9 text-tertiary hover:text-primary gap-1"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Filters
            </Button>
          )}

          <Button
            onClick={() => setShowFilterPanel(true)}
            variant="outline"
            className="border-border text-secondary h-9 text-xs gap-2 font-bold bg-surface-2 hover:bg-surface-hover"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filter Crew {activeFiltersCount > 0 ? `(${activeFiltersCount})` : ""}
          </Button>
        </div>
      </div>

      {/* Form Dialog Modal */}
      {(showCreatePanel || !!editingItem) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl relative">
            <StaffRoleForm
              item={editingItem}
              onSubmit={async (formData) => {
                const payload = {
                  ...formData,
                  department: formData.team_category // Backwards compatibility
                }
                if (editingItem) {
                  await updateItem.mutateAsync({ id: editingItem.id, ...payload })
                } else {
                  await createItem.mutateAsync(payload)
                }
                setShowCreatePanel(false)
                setEditingItem(null)
              }}
              onClose={() => {
                setShowCreatePanel(false)
                setEditingItem(null)
              }}
              isLoading={createItem.isPending || updateItem.isPending}
            />
          </div>
        </div>
      )}

      {/* Excel Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl w-full max-w-lg shadow-2xl relative p-6 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-border">
              <h3 className="text-base font-extrabold text-primary flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-brand-primary" />
                Import Crew Catalogue
              </h3>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-secondary hover:text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <ExcelDropzone
              onUpload={async (file) => {
                const formData = new FormData()
                formData.append('file', file)
                await importExcel.mutateAsync(formData)
                setShowImportModal(false)
              }}
              isLoading={importExcel.isPending}
            />

            <div className="bg-surface-2 p-3.5 rounded-xl border border-border text-xs space-y-2">
              <span className="font-bold text-primary block">Spreadsheet Format Requirements:</span>
              <ul className="list-disc pl-4 space-y-1 text-secondary">
                <li>Accepted headers (row 1): <code className="font-mono bg-surface-3 px-1 rounded text-primary">Role Name</code>, <code className="font-mono bg-surface-3 px-1 rounded text-primary">Role Code</code>, <code className="font-mono bg-surface-3 px-1 rounded text-primary">Team Category</code>, <code className="font-mono bg-surface-3 px-1 rounded text-primary">Grade</code>, <code className="font-mono bg-surface-3 px-1 rounded text-primary">Cost Per Day</code>, <code className="font-mono bg-surface-3 px-1 rounded text-primary">Selling Per Day</code>, <code className="font-mono bg-surface-3 px-1 rounded text-primary">Availability</code>, <code className="font-mono bg-surface-3 px-1 rounded text-primary">Status</code></li>
                <li>Leave <code className="font-mono bg-surface-3 px-1 rounded text-primary">Role Code</code> blank to auto-generate based on Role Name and Team Category.</li>
              </ul>
              <div className="pt-2 text-center">
                <button
                  onClick={() => {
                    const headers = ["Role Name", "Role Code", "Team Category", "Grade", "Cost Per Day", "Selling Per Day", "Availability", "Status"]
                    const sampleRow = ["SRR Operator", "", "Speaker Ready Room (SRR)", "L2", "3500", "5000", "15", "ACTIVE"]
                    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
                      + [headers.join(","), sampleRow.join(",")].join("\n")
                    const encodedUri = encodeURI(csvContent)
                    const link = document.createElement("a")
                    link.setAttribute("href", encodedUri)
                    link.setAttribute("download", "staff_import_template.csv")
                    document.body.appendChild(link)
                    link.click()
                    document.body.removeChild(link)
                  }}
                  className="text-xs text-brand-primary font-bold hover:underline"
                >
                  Download Sample Template (.csv)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter Side Panel */}
      {showFilterPanel && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowFilterPanel(false)} />
          <div className="relative w-full max-w-md bg-[var(--bg-surface)] border-l border-[var(--border-default)] shadow-2xl p-6 overflow-y-auto h-full z-50 flex flex-col justify-between">
            <div className="space-y-6">
              <div className="flex justify-between items-center pb-2 border-b border-border">
                <h3 className="text-sm font-extrabold text-primary uppercase tracking-wider">Filter Crew Directory</h3>
                <button onClick={() => setShowFilterPanel(false)} className="text-secondary hover:text-primary">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Team Category Filter */}
              <div className="space-y-2">
                <label className="text-[10px] text-tertiary uppercase font-bold tracking-wider">Team Category</label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setDepartmentFilter("")}
                    className={`px-2.5 py-1 text-xs rounded-lg border font-medium transition-colors
                      ${!departmentFilter ? 'bg-brand-primary text-white border-brand-primary' : 'bg-surface-2 text-secondary border-border hover:bg-surface-hover'}`}
                  >
                    All Categories
                  </button>
                  {["Speaker Ready Room (SRR)", "Session & Presentation Rooms", "Registration & Check-in", "IT & Networking", "General Operations"].map((dept) => (
                    <button
                      key={dept}
                      onClick={() => setDepartmentFilter(dept)}
                      className={`px-2.5 py-1 text-xs rounded-lg border font-medium transition-colors
                        ${departmentFilter === dept ? 'bg-brand-primary text-white border-brand-primary' : 'bg-surface-2 text-secondary border-border hover:bg-surface-hover'}`}
                    >
                      {dept}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grade Filter */}
              <div className="space-y-2">
                <label className="text-[10px] text-tertiary uppercase font-bold tracking-wider">Grades</label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setGradeFilter("")}
                    className={`px-2.5 py-1 text-xs rounded-lg border font-medium transition-colors
                      ${!gradeFilter ? 'bg-brand-primary text-white border-brand-primary' : 'bg-surface-2 text-secondary border-border hover:bg-surface-hover'}`}
                  >
                    All Grades
                  </button>
                  {["L1", "L2", "L3", "L4", "Manager"].map((gr) => (
                    <button
                      key={gr}
                      onClick={() => setGradeFilter(gr)}
                      className={`px-2.5 py-1 text-xs rounded-lg border font-medium transition-colors
                        ${gradeFilter === gr ? 'bg-brand-primary text-white border-brand-primary' : 'bg-surface-2 text-secondary border-border hover:bg-surface-hover'}`}
                    >
                      {gr}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-border flex gap-2">
              <Button onClick={() => setShowFilterPanel(false)} className="bg-brand-primary text-white text-xs font-bold flex-1">
                Apply Filters
              </Button>
              <Button variant="ghost" onClick={resetFilters} className="text-xs text-secondary flex-1">
                Clear All
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <DataTable
        table={table}
        isLoading={isLoading}
        emptyState={{
          icon: Users,
          title: 'No staff roles',
          description: 'Add staff roles and day rates to build your catalog.',
          actionLabel: 'Add First Role',
          onAction: () => setShowCreatePanel(true)
        }}
      />
    </PageContainer>
  )
}

function StaffRoleForm({ item, onSubmit, onClose, isLoading }: {
  item: any; onSubmit: (d: any) => Promise<void>; onClose: () => void; isLoading: boolean
}) {
  const [form, setForm] = useState({
    name: item?.name ?? '',
    role_code: item?.role_code ?? '',
    grade: item?.grade ?? 'L1',
    team_category: item?.team_category ?? item?.department ?? 'General Operations',
    cost_per_day: item?.cost_per_day ?? '',
    selling_per_day: item?.selling_per_day ?? '',
    available_count: item?.available_count ?? '10',
    status: item?.status ?? 'ACTIVE',
  })

  useEffect(() => {
    setForm({
      name: item?.name ?? '',
      role_code: item?.role_code ?? '',
      grade: item?.grade ?? 'L1',
      team_category: item?.team_category ?? item?.department ?? 'General Operations',
      cost_per_day: item?.cost_per_day ?? '',
      selling_per_day: item?.selling_per_day ?? '',
      available_count: item?.available_count ?? '10',
      status: item?.status ?? 'ACTIVE',
    })
  }, [item])

  const set = (k: string, v: any) => setForm(f => ({...f, [k]: v}))

  // Auto-generate role code based on category and name for new items
  useEffect(() => {
    if (!item && form.team_category && form.name) {
      const cat = form.team_category.toLowerCase()
      let prefix = "OPS"
      if (cat.includes("ready room") || cat.includes("srr")) {
        prefix = "SRR"
      } else if (cat.includes("presentation") || cat.includes("room")) {
        prefix = "ROOM"
      } else if (cat.includes("registration") || cat.includes("check")) {
        prefix = "REG"
      } else if (cat.includes("it") || cat.includes("network")) {
        prefix = "NET"
      }

      const name = form.name.toLowerCase()
      let suffix = ""
      if (name.includes("supervisor")) {
        suffix = "SVR"
      } else if (name.includes("operator")) {
        suffix = "OPR"
      } else if (name.includes("technician") || name.includes("tech")) {
        suffix = "TEC"
      } else if (name.includes("moderator")) {
        suffix = "MOD"
      } else if (name.includes("helpdesk")) {
        suffix = "HD"
      } else if (name.includes("floor")) {
        suffix = "FLR"
      } else if (name.includes("project manager") || name.includes("pm")) {
        suffix = "PM"
      } else {
        const cleanName = name.replace(/[^a-z0-9]/g, "")
        suffix = cleanName ? cleanName.substring(0, 3).toUpperCase() : "ROLE"
      }

      set('role_code', `${prefix}-${suffix}`)
    }
  }, [form.name, form.team_category, item])

  const computedMargin = useMemo(() => {
    const cost = parseFloat(form.cost_per_day as string) || 0
    const sell = parseFloat(form.selling_per_day as string) || 0
    if (sell === 0) return 0
    return ((sell - cost) / sell) * 100
  }, [form.cost_per_day, form.selling_per_day])

  return (
    <div className="p-6 space-y-5">
      <div className="flex justify-between items-center pb-2 border-b border-border">
        <h3 className="text-base font-extrabold text-primary">
          {item ? 'Edit Staff Role' : 'Add New Manpower Role'}
        </h3>
        <div className="flex items-center gap-2">
          <select
            value={form.status}
            onChange={e => set('status', e.target.value)}
            className="px-2 py-1 text-xs bg-surface-2 border border-border rounded font-bold"
          >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
          <button onClick={onClose} className="text-secondary hover:text-primary">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* Left Column */}
        <div className="space-y-4">
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Role Name *</label>
            <Input 
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. SRR Operator" 
              className="bg-surface-2 border-border text-xs" 
            />
          </div>
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Team Category *</label>
            <select 
              value={form.team_category}
              onChange={e => set('team_category', e.target.value)}
              className="w-full px-3 py-2 text-xs bg-surface-2 border border-border rounded-lg text-primary"
            >
              <option value="Speaker Ready Room (SRR)">Speaker Ready Room (SRR)</option>
              <option value="Session & Presentation Rooms">Session & Presentation Rooms</option>
              <option value="Registration & Check-in">Registration & Check-in</option>
              <option value="IT & Networking">IT & Networking</option>
              <option value="General Operations">General Operations</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Grade *</label>
            <select 
              value={form.grade}
              onChange={e => set('grade', e.target.value)}
              className="w-full px-3 py-2 text-xs bg-surface-2 border border-border rounded-lg text-primary"
            >
              <option value="L1">L1</option>
              <option value="L2">L2</option>
              <option value="L3">L3</option>
              <option value="L4">L4</option>
              <option value="Manager">Manager</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Role Code</label>
            <Input 
              value={form.role_code}
              readOnly
              disabled
              placeholder="Generated Automatically..." 
              className="bg-surface-3 border-border text-xs font-mono font-bold text-tertiary cursor-not-allowed" 
            />
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Cost / Day (₹) *</label>
            <Input 
              type="number" 
              value={form.cost_per_day}
              onChange={e => set('cost_per_day', e.target.value)}
              placeholder="e.g. 3500" 
              className="bg-surface-2 border-border text-xs" 
            />
          </div>
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Selling / Day (₹) *</label>
            <Input 
              type="number" 
              value={form.selling_per_day}
              onChange={e => set('selling_per_day', e.target.value)}
              placeholder="e.g. 5000" 
              className="bg-surface-2 border-border text-xs" 
            />
          </div>
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Availability *</label>
            <Input 
              type="number" 
              value={form.available_count}
              onChange={e => set('available_count', e.target.value)}
              placeholder="e.g. 15" 
              className="bg-surface-2 border-border text-xs" 
            />
          </div>
          <div className="pt-2">
            <div className="bg-surface-2 p-3.5 rounded-xl border border-border flex justify-between items-center text-xs">
              <span className="font-semibold text-secondary">Profit Margin</span>
              <span className={`font-mono font-bold text-sm ${computedMargin >= 30 ? 'text-success' : 'text-warning'}`}>
                {computedMargin.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t border-border">
        <Button variant="ghost" onClick={onClose} className="text-xs text-secondary">
          Cancel
        </Button>
        <Button
          onClick={() => onSubmit(form)}
          disabled={isLoading || !form.name || !form.cost_per_day || !form.selling_per_day}
          className="bg-brand-primary text-white text-xs font-bold px-4"
        >
          {isLoading ? 'Saving...' : item ? 'Update Role' : 'Create Role'}
        </Button>
      </div>
    </div>
  )
}

function ExcelDropzone({ onUpload, isLoading }: { onUpload: (file: File) => Promise<void>; isLoading: boolean }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
    onDrop: async (acceptedFiles) => {
      if (acceptedFiles && acceptedFiles.length > 0) {
        await onUpload(acceptedFiles[0])
      }
    },
  })

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors duration-200
        ${isDragActive ? 'border-brand-primary bg-brand-primary/10' : 'border-border hover:border-brand-primary hover:bg-surface-2'}
        ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}
    >
      <input {...getInputProps()} />
      <Upload className="h-10 w-10 text-secondary mb-3" />
      {isLoading ? (
        <span className="text-xs font-semibold text-secondary animate-pulse">Uploading and parsing catalogue...</span>
      ) : isDragActive ? (
        <span className="text-xs font-semibold text-brand-primary">Drop the catalogue file here...</span>
      ) : (
        <div className="text-center space-y-1">
          <span className="text-xs font-bold text-primary block">Drag & drop your Excel template here</span>
          <span className="text-[10px] text-tertiary block">or click to browse local files (.xlsx, .xls, .csv)</span>
        </div>
      )}
    </div>
  )
}
