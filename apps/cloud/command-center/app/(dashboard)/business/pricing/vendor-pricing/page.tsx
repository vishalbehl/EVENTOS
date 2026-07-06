"use client"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader"
import { Card } from "@/components/ui/card"
import { Landmark, Users, Truck, DollarSign } from "lucide-react"

export default function VendorPricingPage() {
  const vendors = [
    { name: "Acme IT Rentals", type: "Hardware", itemsCount: 15, marginApplied: "15%", region: "Metro Area" },
    { name: "Infield Crew Co", type: "Manpower Staffing", itemsCount: 8, marginApplied: "20%", region: "Rest of India" },
    { name: "TechRent Logistics", type: "Transport & Shipping", itemsCount: 4, marginApplied: "10%", region: "Global" }
  ]

  const mockRates = [
    { item: "iPad Self Check-in Kiosk", category: "Hardware", baseCost: 1500, sellingPrice: 2200, margin: "46.6%", vendor: "Acme IT Rentals" },
    { item: "Thermal Badge Printer", category: "Hardware", baseCost: 1800, sellingPrice: 2600, margin: "44.4%", vendor: "Acme IT Rentals" },
    { item: "IT Support Engineer", category: "Staffing", baseCost: 4000, sellingPrice: 6000, margin: "50%", vendor: "Infield Crew Co" },
    { item: "Registration Executive", category: "Staffing", baseCost: 2000, sellingPrice: 3000, margin: "50%", vendor: "Infield Crew Co" }
  ]

  return (
    <PageContainer>
      <SectionHeader
        title="Vendor Pricing"
        description="Track third-party hardware lease base rates, local manpower outsourcing, and logistic markups"
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
        {vendors.map((vendor) => (
          <Card key={vendor.name} className="p-5 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl flex flex-col justify-between hover:border-brand-primary/45 transition-colors">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs text-tertiary block font-semibold uppercase tracking-wider mb-1">{vendor.type}</span>
                <h4 className="text-sm font-extrabold text-primary">{vendor.name}</h4>
              </div>
              <div className="p-2 bg-brand-primary/10 border border-brand-primary/20 text-brand-primary rounded-xl">
                {vendor.type === "Hardware" ? <Truck className="h-4 w-4" /> : <Users className="h-4 w-4" />}
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-[var(--border-subtle)] grid grid-cols-2 gap-2 text-[10px] font-bold text-secondary">
              <div>
                <span className="text-tertiary block text-[9px] mb-0.5">ITEMS TRACKED</span>
                <span>{vendor.itemsCount} Items</span>
              </div>
              <div>
                <span className="text-tertiary block text-[9px] mb-0.5">DEFAULT MARKUP</span>
                <span className="text-success">{vendor.marginApplied}</span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-8">
        <h3 className="text-xs font-extrabold uppercase tracking-widest text-secondary mb-4 flex items-center gap-1.5">
          <Landmark className="h-4 w-4 text-brand-primary" /> Core Outsourcing Cost Mappings
        </h3>
        <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-surface-2 border-b border-border text-secondary font-bold uppercase text-[10px]">
                <th className="p-4">Item Name / Role</th>
                <th className="p-4">Category</th>
                <th className="p-4">Base Vendor Cost</th>
                <th className="p-4">Selling Catalog Rate</th>
                <th className="p-4 text-right">Operational Margin</th>
              </tr>
            </thead>
            <tbody>
              {mockRates.map((rate) => (
                <tr key={rate.item} className="border-b border-border/40 hover:bg-surface-hover/20">
                  <td className="p-4 font-semibold text-primary">{rate.item}</td>
                  <td className="p-4 text-secondary text-xs">{rate.category}</td>
                  <td className="p-4 font-mono text-secondary font-medium">₹{rate.baseCost.toLocaleString()}/day</td>
                  <td className="p-4 font-mono text-success font-bold">₹{rate.sellingPrice.toLocaleString()}/day</td>
                  <td className="p-4 text-right font-mono font-semibold text-brand-primary">{rate.margin}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PageContainer>
  )
}
