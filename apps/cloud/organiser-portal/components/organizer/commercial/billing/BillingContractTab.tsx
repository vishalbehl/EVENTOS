"use client";
import Link from "next/link";
import { Panel, StatusBadge } from "../../workspace/OrganiserPrimitives";
import { CommercialPage } from "./shared";
import { useCloudCommercialAccount, useCloudContracts } from "@/hooks/useCloudCommercial";

export function BillingContractTab(){
  const account=useCloudCommercialAccount();
  const contracts=useCloudContracts();
  return <CommercialPage><Panel title="Cloud commercial contracts" action={<Link href="/commercial/overview" className="text-xs font-bold text-[var(--op-primary)]">Commercial overview</Link>}>{account.isLoading||contracts.isLoading?<p className="op-state-copy">Loading contract composition…</p>:account.isError||contracts.isError?<p className="op-state-copy">Cloud contract data is unavailable.</p>:(contracts.data||[]).length===0?<p className="op-state-copy">No cloud contract is active. Choose a Workspace, Event, or EMC plan from Commercial.</p>:<div className="space-y-3">{(contracts.data||[]).map((contract:any)=><div key={contract.id} className="rounded-xl border border-[var(--op-border)] p-3"><div className="flex flex-wrap items-center justify-between gap-3"><span className="font-semibold">{contract.contract_type} · {contract.billing_interval}</span><StatusBadge status={contract.status||"Unavailable"}/></div><p className="mt-1 text-xs text-[var(--op-muted)]">{(contract.items||[]).map((item:any)=>item.offer_code||item.display_name||"Commercial item").join(", ")||"Composition unavailable"}</p><p className="mt-1 text-xs text-[var(--op-muted)]">GST is shown separately on invoices; historical offer versions remain fixed.</p></div>)}</div>}</Panel></CommercialPage>;
}
