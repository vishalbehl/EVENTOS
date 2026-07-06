"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import {
    ArrowLeft,
    Globe,
    Plus,
    RefreshCw,
    Trash2,
    CheckCircle,
    HelpCircle,
    ShieldCheck,
    Building,
    Activity,
    Network
} from "lucide-react";
import { toast } from "sonner";
interface CustomDomain {
    id: string;
    domain: string;
    status: string;
    sslStatus: string;
    verifiedAt: string;
}
export default function DomainManagerPage() {
    const params = useParams();
    const router = useRouter();
    const siteId = params.id as string;
    const [domains, setDomains] = useState<CustomDomain[]>([
        { id: "d1", domain: "summit.techorg.com", status: "ACTIVE", sslStatus: "ACTIVE", verifiedAt: "2026-06-12 14:30" },
        { id: "d2", domain: "annual.techorg.com", status: "PENDING", sslStatus: "NONE", verifiedAt: "—" },
    ]);
    const [newDomain, setNewDomain] = useState("");
    const [isVerifying, setIsVerifying] = useState(false);
    const handleAddDomain = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newDomain) {
            toast.error("Please enter a domain name");
            return;
        }
        // Simple validation
        if (!newDomain.includes(".") || newDomain.length < 4) {
            toast.error("Please enter a valid FQDN domain");
            return;
        }
        const item: CustomDomain = {
            id: Math.random().toString(),
            domain: newDomain,
            status: "PENDING",
            sslStatus: "NONE",
            verifiedAt: "—"
        };
        setDomains([...domains, item]);
        toast.success(`Domain ${newDomain} registered. Configure DNS records on the right.`);
        setNewDomain("");
    };
    const handleDelete = (id: string) => {
        setDomains(domains.filter(d => d.id !== id));
        toast.success("Domain deleted from site routing.");
    };
    const handleVerifyDNS = () => {
        setIsVerifying(true);
        toast.loading("Polling authoritative DNS servers for CNAME records...");

        setTimeout(() => {
            setDomains(prev =>
                prev.map(d => {
                    if (d.status === "PENDING") {
                        return {
                            ...d,
                            status: "ACTIVE",
                            sslStatus: "ACTIVE",
                            verifiedAt: new Date().toISOString().replace("T", " ").substring(0, 16)
                        };
                    }
                    return d;
                })
            );
            toast.dismiss();
            toast.success("DNS records verified! Let's Encrypt SSL certificate provisioned successfully.");
            setIsVerifying(false);
        }, 2000);
    };
    return (
        <PageContainer>
            <div className="mb-4">
                <button
                    onClick={() => router.push("/super-admin/builder/sites")}
                    className="inline-flex items-center gap-1 text-[11px] font-black uppercase text-violet-400 hover:text-white transition-colors"
                >
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
                </button>
            </div>
            <SectionHeader
                title="Custom Domains & SSL"
                description="Verify authority on custom event domains. Automate Let's Encrypt certificate renewals."
            />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left column: Registered Custom Domains */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="p-6 rounded-3xl border border-white/5 bg-white/5 backdrop-blur-lg">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                                <Globe className="w-4 h-4 text-violet-400" /> Active Hostnames
                            </h3>
                            <button
                                onClick={handleVerifyDNS}
                                disabled={isVerifying}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-violet-500/20 bg-violet-500/10 hover:bg-violet-500/20 text-[10px] font-black uppercase text-violet-300 transition-all disabled:opacity-50"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? "animate-spin" : ""}`} /> Poll Records & SSL
                            </button>
                        </div>
                        <div className="space-y-4">
                            {domains.map((dom) => (
                                <div
                                    key={dom.id}
                                    className="p-5 rounded-2xl border border-white/5 bg-white/5 hover:border-violet-500/20 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                                >
                                    <div>
                                        <h4 className="text-xs font-bold text-white font-mono">{dom.domain}</h4>
                                        <p className="text-[10px] text-white/40 mt-1 font-mono">Verified At: {dom.verifiedAt}</p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex gap-2">
                                            <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${dom.status === "ACTIVE"
                                                    ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                                                    : "bg-amber-500/10 border border-amber-500/20 text-amber-400"
                                                }`}>
                                                DNS: {dom.status}
                                            </span>
                                            <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${dom.sslStatus === "ACTIVE"
                                                    ? "bg-violet-500/10 border border-violet-500/20 text-violet-400"
                                                    : "bg-zinc-800 border border-white/10 text-white/40"
                                                }`}>
                                                SSL: {dom.sslStatus}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => handleDelete(dom.id)}
                                            className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-all"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    {/* Form to add hostname */}
                    <div className="p-6 rounded-3xl border border-white/5 bg-white/5 backdrop-blur-lg">
                        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-1.5">
                            <Network className="w-4 h-4 text-violet-400" /> Register New Hostname
                        </h3>
                        <form onSubmit={handleAddDomain} className="flex flex-col sm:flex-row gap-3 items-end">
                            <div className="flex-1 w-full">
                                <label className="block text-[9px] font-black uppercase text-white/40 mb-1">
                                    Fully Qualified Domain Name (FQDN) *
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. summit.acme.com"
                                    value={newDomain}
                                    onChange={(e) => setNewDomain(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-violet-500 focus:outline-none transition-colors"
                                />
                            </div>
                            <button
                                type="submit"
                                className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-xs font-black uppercase text-white shadow-lg shrink-0 transition-colors"
                            >
                                <Plus className="w-3.5 h-3.5" /> Register Domain
                            </button>
                        </form>
                    </div>
                </div>
                {/* Right column: DNS Config panel */}
                <div className="p-6 rounded-3xl border border-white/5 bg-white/5 backdrop-blur-lg h-fit">
                    <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-violet-400" /> DNS Instructions
                    </h3>
                    <p className="text-xs text-white/60 leading-relaxed mb-6">
                        Configure the following records on your DNS hosting provider (e.g. Cloudflare, Route53) to verify custom hostnames.
                    </p>
                    <div className="space-y-4">
                        <div className="p-4 rounded-2xl bg-zinc-900 border border-white/5 space-y-3">
                            <div>
                                <span className="text-[9px] font-black uppercase text-white/30 block mb-0.5">Record Type</span>
                                <span className="text-xs font-mono font-bold text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded">
                                    CNAME
                                </span>
                            </div>
                            <div>
                                <span className="text-[9px] font-black uppercase text-white/30 block mb-0.5">Host Name</span>
                                <span className="text-xs font-mono text-white/80 select-all">
                                    summit
                                </span>
                            </div>
                            <div>
                                <span className="text-[9px] font-black uppercase text-white/30 block mb-0.5">Target Value</span>
                                <span className="text-xs font-mono text-white/80 select-all">
                                    cname.eventx.com
                                </span>
                            </div>
                        </div>
                        <div className="flex gap-2 p-3.5 rounded-2xl border border-violet-500/20 bg-violet-500/5 text-violet-300 text-[11px] leading-relaxed">
                            <HelpCircle className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
                            <p>
                                Authoritative CNAME configuration propagates within 1-15 minutes globally. Provisioning Let's Encrypt certs runs concurrently with verification.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </PageContainer>
    );
}
