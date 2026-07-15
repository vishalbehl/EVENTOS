"use client"
import { useState, useEffect, useMemo } from "react"
import { useHardwareCatalog, useHardwareCategories,
         useCreateHardwareItem, useUpdateHardwareItem, useDeleteHardwareItem,
         useImportHardwareExcel,
         formatINR } from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader"
import { MetricRow } from "@/components/super-admin/ui/MetricRow"
import { DataTable } from "@/components/super-admin/ui/DataTable"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Package, Plus, Search, FileSpreadsheet, SlidersHorizontal, RotateCcw, X, Upload } from "lucide-react"
import { useDebounce } from "@/hooks/use-debounce"
import { useReactTable, getCoreRowModel } from "@tanstack/react-table"
import { useDropzone } from "react-dropzone"

export default function HardwareCatalogPage() {
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("")
  const [pricingUnitFilter, setPricingUnitFilter] = useState<string>("")
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [activeOnly, setActiveOnly] = useState(false)
  const [page, setPage] = useState(0)
  const [showCreatePanel, setShowCreatePanel] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [editingItem, setEditingItem] = useState<any>(null)
  const limit = 20

  const debouncedSearch = useDebounce(search, 300)

  // Mapping status filter
  const statusParam = activeOnly ? "AVAILABLE" : (statusFilter === "Active" ? "AVAILABLE" : (statusFilter === "Inactive" ? "INACTIVE" : undefined))

  const { data, isLoading } = useHardwareCatalog({
    search: debouncedSearch || undefined,
    category: categoryFilter || undefined,
    pricing_unit: pricingUnitFilter || undefined,
    status: statusParam,
    skip: page * limit,
    limit,
  })
  const { data: categories } = useHardwareCategories()
  const createItem = useCreateHardwareItem()
  const updateItem = useUpdateHardwareItem()
  const deleteItem = useDeleteHardwareItem()
  const importExcel = useImportHardwareExcel()

  const summary = data?.summary

  const PRICING_UNIT_COLORS: Record<string, string> = {
    PER_DAY: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800',
    PER_EVENT: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-800',
    PER_DEVICE: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800',
    PER_ROOM: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-300 dark:border-indigo-800',
    PER_COUNTER: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800',
  }

  const CATEGORY_COLORS: Record<string, string> = {
    'Registration': 'bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950/30 dark:text-pink-300 dark:border-pink-800',
    'SRR': 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-300 dark:border-indigo-800',
    'Presentation': 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/30 dark:text-teal-300 dark:border-teal-800',
    'Networking': 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/30 dark:text-cyan-300 dark:border-cyan-800',
    'Check-in': 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800',
    'Office Equipment': 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-800',
    'Storage': 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-800',
    'Accessories': 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950/30 dark:text-slate-300 dark:border-slate-800',
  }

  // Client-side CSV Exporter
  const handleExportCSV = () => {
    if (!data?.items) return
    const headers = ["Hardware Code", "Hardware Name", "Category", "Pricing Unit", "Cost Price", "Renting Price", "Inventory Count", "Status"]
    const rows = data.items.map(item => [
      item.item_code,
      item.name,
      item.category_name,
      item.pricing_unit,
      item.cost_price,
      item.selling_price,
      item.inventory_count ?? 0,
      item.status === "AVAILABLE" ? "Active" : "Inactive"
    ])
    
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${val}"`).join(","))].join("\n")
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", "hardware_catalog_export.csv")
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const columns = useMemo(() => [
    {
      accessorKey: "item_code",
      header: "Hardware Code",
      cell: ({ row }: any) => (
        <span className="font-mono text-xs font-bold text-brand-primary">
          {row.original.item_code}
        </span>
      )
    },
    {
      accessorKey: "name",
      header: "Hardware Name",
      cell: ({ row }: any) => (
        <div>
          <span className="text-xs font-semibold text-primary block">
            {row.original.name}
          </span>
          {row.original.description && (
            <span className="text-[10px] text-secondary block mt-0.5 max-w-xs truncate">
              {row.original.description}
            </span>
          )}
        </div>
      )
    },
    {
      accessorKey: "category_name",
      header: "Category",
      cell: ({ row }: any) => {
        const cat = row.original.category_name || "Accessories"
        const colors = CATEGORY_COLORS[cat] || CATEGORY_COLORS['Accessories']
        return (
          <Badge variant="outline" className={`text-[10px] border font-bold px-2 py-0.5 rounded-full ${colors}`}>
            {cat}
          </Badge>
        )
      }
    },
    {
      accessorKey: "pricing_unit",
      header: "Pricing Unit",
      cell: ({ row }: any) => (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border
          ${PRICING_UNIT_COLORS[row.original.pricing_unit]
            ?? 'bg-surface-2 text-secondary border-border'}`}>
          {row.original.pricing_unit}
        </span>
      )
    },
    {
      accessorKey: "cost_price",
      header: "Cost Price (₹)",
      cell: ({ row }: any) => (
        <span className="text-xs font-mono text-secondary">
          {formatINR(row.original.cost_price)}
        </span>
      )
    },
    {
      accessorKey: "selling_price",
      header: "Renting Price (₹)",
      cell: ({ row }: any) => (
        <span className="text-xs font-mono text-success font-semibold">
          {formatINR(row.original.selling_price)}
        </span>
      )
    },
    {
      accessorKey: "inventory_count",
      header: "Inventory",
      cell: ({ row }: any) => (
        <div className="text-xs font-mono">
          <span className="text-primary">{row.original.inventory_count ?? 0}</span>
          <span className="text-tertiary text-[10px] ml-1">({row.original.reserved_count ?? 0} res)</span>
        </div>
      )
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }: any) => (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border
          ${row.original.is_active || row.original.status === 'AVAILABLE'
            ? 'bg-success-muted/20 text-success border-success/30'
            : 'bg-surface-2 text-tertiary border-border'}`}>
          {row.original.is_active || row.original.status === 'AVAILABLE'
            ? '● Active' : '○ Inactive'}
        </span>
      )
    },
    {
      id: "actions",
      cell: ({ row }: any) => (
        <div className="flex items-center gap-1">
          <Button
            size="sm" variant="ghost"
            onClick={() => setEditingItem(row.original)}
            className="text-xs text-secondary hover:text-primary h-8 px-2"
          >
            Edit
          </Button>
          <Button
            size="sm" variant="ghost"
            onClick={async () => {
              if (window.confirm(`Are you sure you want to delete "${row.original.name}"?`)) {
                await deleteItem.mutateAsync(row.original.id)
              }
            }}
            className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 h-8 px-2"
          >
            Delete
          </Button>
        </div>
      )
    }
  ], [categories])

  const table = useReactTable({
    data: data?.items ?? [],
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
    setCategoryFilter("")
    setPricingUnitFilter("")
    setStatusFilter("")
    setActiveOnly(false)
    setPage(0)
  }

  const activeFiltersCount = useMemo(() => {
    let cnt = 0
    if (categoryFilter) cnt++
    if (pricingUnitFilter) cnt++
    if (statusFilter) cnt++
    if (activeOnly) cnt++
    return cnt
  }, [categoryFilter, pricingUnitFilter, statusFilter, activeOnly])

  const nextItemCode = useMemo(() => {
    return data?.next_item_code ?? 'HW-1001'
  }, [data?.next_item_code])

  return (
    <PageContainer>
      <SectionHeader
        title="Hardware Catalog"
        description="Manage all hardware assets, pricing and availability"
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
              className="bg-brand-primary hover:bg-brand-primary/90 text-white gap-2 h-9 text-xs"
            >
              <Plus className="h-4 w-4" />
              Add Hardware
            </Button>
          </div>
        }
      />

      {/* KPI Cards */}
      <MetricRow metrics={[
        { label: 'Total Hardware Items', value: summary?.total_items ?? 0 },
        { label: 'Active Items', value: summary?.active_items ?? 0 },
        { label: 'Categories', value: summary?.categories ?? 0 },
        { label: 'Avg Cost Price',
          value: formatINR(summary?.avg_cost_price ?? 0) },
        { label: 'Avg Renting Price',
          value: formatINR(summary?.avg_selling_price ?? 0) },
        { label: 'Total Inventory Value',
          value: formatINR(summary?.total_inventory_value ?? 0) },
      ]} />

      {/* Advanced Filter Row (INLINE SELECT DROPDOWNS NEXT TO SEARCH BAR) */}
      <div className="flex flex-wrap items-center gap-3 bg-[var(--bg-surface)] border border-[var(--border-default)] p-4 rounded-2xl">
        <div className="relative w-full sm:max-w-xs flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-tertiary" />
          <Input
            placeholder="Search items, SKU code..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
            className="pl-9 bg-surface-2 border-border h-9 text-xs"
          />
        </div>

        {/* Category Filter */}
        <div className="w-full sm:w-44">
          <select
            value={categoryFilter}
            onChange={e => { setCategoryFilter(e.target.value); setPage(0) }}
            className="w-full h-9 px-3 py-1.5 text-xs bg-surface-2 border border-border rounded-lg text-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
          >
            <option value="">All Categories</option>
            {(data as any)?.active_categories?.map((catName: string) => (
              <option key={catName} value={catName}>{catName}</option>
            ))}
          </select>
        </div>

        {/* Pricing Unit Filter */}
        <div className="w-full sm:w-40">
          <select
            value={pricingUnitFilter}
            onChange={e => { setPricingUnitFilter(e.target.value); setPage(0) }}
            className="w-full h-9 px-3 py-1.5 text-xs bg-surface-2 border border-border rounded-lg text-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
          >
            <option value="">All Pricing Units</option>
            {(data as any)?.active_pricing_units?.map((unit: string) => (
              <option key={unit} value={unit}>{unit}</option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div className="w-full sm:w-36">
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(0) }}
            className="w-full h-9 px-3 py-1.5 text-xs bg-surface-2 border border-border rounded-lg text-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
          >
            <option value="">All Statuses</option>
            <option value="Active">Active Only</option>
            <option value="Inactive">Inactive Only</option>
          </select>
        </div>

        {/* Active Only Toggle Checkbox */}
        <div className="flex items-center gap-2 h-9 px-2">
          <input
            type="checkbox"
            id="inlineActiveOnly"
            checked={activeOnly}
            onChange={e => { setActiveOnly(e.target.checked); setPage(0) }}
            className="rounded h-3.5 w-3.5 text-brand-primary bg-surface-2 border-border"
          />
          <label htmlFor="inlineActiveOnly" className="text-xs font-semibold text-secondary cursor-pointer select-none">
            Available Stock Only
          </label>
        </div>

        {/* Reset button */}
        {(activeFiltersCount > 0 || search) && (
          <div className="ml-auto">
            <Button
              variant="ghost"
              onClick={() => {
                setSearch("")
                resetFilters()
              }}
              className="text-xs h-9 text-tertiary hover:text-primary gap-1"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
          </div>
        )}
      </div>

      {/* Centered Pop-up Modal Window for Add/Edit Form */}
      {(showCreatePanel || !!editingItem) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl relative">
            <HardwareItemForm
              item={editingItem}
              categories={categories ?? []}
              nextItemCode={nextItemCode}
              onSubmit={async (formData) => {
                if (editingItem) {
                  await updateItem.mutateAsync({ id: editingItem.id, ...formData })
                } else {
                  await createItem.mutateAsync(formData)
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

      {/* Centered Pop-up Modal Window for Excel Import */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl w-full max-w-lg shadow-2xl relative p-6 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-border">
              <h3 className="text-base font-extrabold text-primary flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-brand-primary" />
                Import Hardware Catalog
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
                <li>Accepted headers (row 1): <code className="font-mono bg-surface-3 px-1 rounded text-primary">Hardware Name</code>, <code className="font-mono bg-surface-3 px-1 rounded text-primary">Category</code>, <code className="font-mono bg-surface-3 px-1 rounded text-primary">Pricing Unit</code>, <code className="font-mono bg-surface-3 px-1 rounded text-primary">Cost Price</code>, <code className="font-mono bg-surface-3 px-1 rounded text-primary">Renting Price</code>, <code className="font-mono bg-surface-3 px-1 rounded text-primary">Inventory Count</code>, <code className="font-mono bg-surface-3 px-1 rounded text-primary">Brand</code>, <code className="font-mono bg-surface-3 px-1 rounded text-primary">Model</code>, <code className="font-mono bg-surface-3 px-1 rounded text-primary">Description</code>, <code className="font-mono bg-surface-3 px-1 rounded text-primary">Tax Category</code></li>
                <li>Leave <code className="font-mono bg-surface-3 px-1 rounded text-primary">Hardware Code</code> blank to auto-assign codes sequentially starting from <code className="font-mono">HW-1001</code>.</li>
              </ul>
              <div className="pt-2 text-center">
                <button
                  onClick={() => {
                    const headers = ["Hardware Name", "Hardware Code", "Category", "Pricing Unit", "Cost Price", "Renting Price", "Brand", "Model", "Inventory Count", "Description", "Tax Category"]
                    const sampleRow = ["Presenter Podium Laptop", "HW-1001", "SRR", "PER_EVENT", "12000", "15000", "Apple", "MacBook Pro M3", "10", "High-performance presentation laptop", "GST_18"]
                    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
                      + [headers.join(","), sampleRow.join(",")].join("\n")
                    const encodedUri = encodeURI(csvContent)
                    const link = document.createElement("a")
                    link.setAttribute("href", encodedUri)
                    link.setAttribute("download", "hardware_import_template.csv")
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



      {/* Table */}
      <DataTable
        table={table}
        isLoading={isLoading}
        emptyState={{
          icon: Package,
          title: 'No hardware items',
          description: 'Add hardware items to build your catalog.',
          actionLabel: 'Add First Item',
          onAction: () => setShowCreatePanel(true)
        }}
      />
    </PageContainer>
  )
}

function HardwareItemForm({ item, categories, nextItemCode, onSubmit, onClose, isLoading }: {
  item: any; categories: any[]; nextItemCode: string; onSubmit: (d: any) => Promise<void>
  onClose: () => void; isLoading: boolean
}) {
  const [form, setForm] = useState({
    item_code: item?.item_code ?? nextItemCode,
    name: item?.name ?? '',
    category_id: item?.category_id ?? '',
    pricing_unit: item?.pricing_unit ?? 'PER_EVENT',
    cost_price: item?.cost_price ?? '',
    selling_price: item?.selling_price ?? '',
    inventory_count: item?.inventory_count ?? '',
    brand: item?.brand ?? 'Standard',
    model: item?.model ?? 'Generic v1',
    status: item?.status ?? 'AVAILABLE',
    description: item?.description ?? '',
    tax_category: item?.tax_category ?? 'GST_18',
  })

  useEffect(() => {
    setForm({
      item_code: item?.item_code ?? nextItemCode,
      name: item?.name ?? '',
      category_id: item?.category_id ?? '',
      pricing_unit: item?.pricing_unit ?? 'PER_EVENT',
      cost_price: item?.cost_price ?? '',
      selling_price: item?.selling_price ?? '',
      inventory_count: item?.inventory_count ?? '',
      brand: item?.brand ?? 'Standard',
      model: item?.model ?? 'Generic v1',
      status: item?.status ?? 'AVAILABLE',
      description: item?.description ?? '',
      tax_category: item?.tax_category ?? 'GST_18',
    })
  }, [item, nextItemCode])

  const set = (k: string, v: any) => setForm(f => ({...f, [k]: v}))

  const computedMargin = useMemo(() => {
    const cost = parseFloat(form.cost_price as string) || 0
    const sell = parseFloat(form.selling_price as string) || 0
    if (sell === 0) return 0
    return ((sell - cost) / sell) * 100
  }, [form.cost_price, form.selling_price])

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-center pb-2 border-b border-border">
        <h3 className="text-base font-extrabold text-primary">
          {item ? 'Edit Hardware Item' : 'Add New Hardware'}
        </h3>
        <div className="flex items-center gap-2">
          <select
            value={form.status}
            onChange={e => set('status', e.target.value)}
            className="px-2 py-1 text-xs bg-surface-2 border border-border rounded font-bold"
          >
            <option value="AVAILABLE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
          <button onClick={onClose} className="text-secondary hover:text-primary">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Hardware Name *</label>
            <Input value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Samsung 65' 4K Display" className="bg-surface-2 border-border text-xs" />
          </div>
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Hardware Code (SKU) *</label>
            <Input value={form.item_code}
              onChange={e => set('item_code', e.target.value)}
              placeholder="HW-1004" className="bg-surface-2 border-border text-xs" />
          </div>
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Category *</label>
            <select value={form.category_id}
              onChange={e => set('category_id', e.target.value)}
              className="w-full px-3 py-2 text-xs bg-surface-2 border border-border rounded-lg text-primary">
              <option value="">Select category</option>
              {categories?.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Pricing Unit *</label>
            <select value={form.pricing_unit}
              onChange={e => set('pricing_unit', e.target.value)}
              className="w-full px-3 py-2 text-xs bg-surface-2 border border-border rounded-lg text-primary">
              <option value="PER_DAY">PER_DAY</option>
              <option value="PER_EVENT">PER_EVENT</option>
              <option value="PER_DEVICE">PER_DEVICE</option>
              <option value="PER_ROOM">PER_ROOM</option>
              <option value="PER_COUNTER">PER_COUNTER</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Cost Price (Procurement) *</label>
            <Input type="number" value={form.cost_price}
              onChange={e => set('cost_price', e.target.value)}
              placeholder="10000" className="bg-surface-2 border-border text-xs" />
          </div>
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Renting Price (Billing) *</label>
            <Input type="number" value={form.selling_price}
              onChange={e => set('selling_price', e.target.value)}
              placeholder="15000" className="bg-surface-2 border-border text-xs" />
          </div>
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Brand</label>
            <Input value={form.brand}
              onChange={e => set('brand', e.target.value)}
              placeholder="Samsung" className="bg-surface-2 border-border text-xs" />
          </div>
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Model</label>
            <Input value={form.model}
              onChange={e => set('model', e.target.value)}
              placeholder="LH65QBREB" className="bg-surface-2 border-border text-xs" />
          </div>
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Tax Category (GST) *</label>
            <select value={form.tax_category}
              onChange={e => set('tax_category', e.target.value)}
              className="w-full px-3 py-2 text-xs bg-surface-2 border border-border rounded-lg text-primary">
              <option value="GST_18">GST 18%</option>
              <option value="GST_12">GST 12%</option>
              <option value="GST_5">GST 5%</option>
              <option value="ZERO">Zero Tax</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-secondary mb-1 block font-semibold">Available Quantity *</label>
            <Input type="number" value={form.inventory_count}
              onChange={e => set('inventory_count', e.target.value)}
              placeholder="50" className="bg-surface-2 border-border text-xs" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-secondary mb-1 block font-semibold">Description</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Commercial description of the display item..."
              rows={2}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs text-primary"
            />
          </div>
        </div>

        <div className="bg-surface-2 p-3 rounded-lg border border-border flex justify-between items-center text-xs">
          <span className="font-semibold text-secondary">Calculated Margin</span>
          <span className={`font-mono font-bold text-sm ${computedMargin >= 30 ? 'text-success' : 'text-warning'}`}>
            {computedMargin.toFixed(2)}%
          </span>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t border-border">
        <Button variant="ghost" onClick={onClose} className="text-xs text-secondary">
          Cancel
        </Button>
        <Button
          onClick={() => onSubmit(form)}
          disabled={isLoading || !form.item_code || !form.name || !form.cost_price || !form.selling_price || !form.category_id || !form.inventory_count}
          className="bg-brand-primary text-white text-xs font-bold"
        >
          {isLoading ? 'Saving...' : item ? 'Update Hardware' : 'Create Hardware'}
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
        <span className="text-xs font-semibold text-secondary animate-pulse">Uploading and parsing catalog...</span>
      ) : isDragActive ? (
        <span className="text-xs font-semibold text-brand-primary">Drop the catalog file here...</span>
      ) : (
        <div className="text-center space-y-1">
          <span className="text-xs font-bold text-primary block">Drag & drop your Excel template here</span>
          <span className="text-[10px] text-tertiary block">or click to browse local files (.xlsx, .xls, .csv)</span>
        </div>
      )}
    </div>
  )
}
