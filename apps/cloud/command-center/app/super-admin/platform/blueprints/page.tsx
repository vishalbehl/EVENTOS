"use client";
import { useState, useMemo } from "react";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { KpiCard } from "@/components/super-admin/ui/KpiCard";
import {
    ClipboardList,
    Compass,
    ArrowRight,
    Database,
    Building,
    Settings,
    Plus,
    ArrowLeft,
    ShieldAlert,
    PlayCircle,
    Activity,
    Layers,
    Search,
    CheckCircle2
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
interface BlueprintStep {
    order: number;
    name: string;
    type: string;
}
interface Blueprint {
    id: string;
    name: string;
    industry: string;
    description: string;
    steps: BlueprintStep[];
    isSystem: boolean;
    status: string;
    installs: number;
}
export default function BlueprintsPage() {
    const [search, setSearch] = useState("");
    const [selectedBlueprint, setSelectedBlueprint] = useState<Blueprint | null>(null);
    const [showInstaller, setShowInstaller] = useState(false);
    const [targetOrg, setTargetOrg] = useState("");
    const [blueprints] = useState<Blueprint[]>([
        {
            id: "b1",
            name: "Global Technology Conference Blueprint",
            industry: "Technology",
            description: "Standard configuration for a multi-track developer summit featuring 5 registration categories, VIP badge printing, and sponsor website components.",
            steps: [
                { order: 1, name: "Deploy Summit Landing Website Template", type: "WEBSITE_TEMPLATE" },
                { order: 2, name: "Provision Multi-Ticket Registration Form", type: "REGISTRATION_FLOW" },
                { order: 3, name: "Enable Sponsor Billing Catalog Packages", type: "COMMERCIAL_CATALOG" },
                { order: 4, name: "Configure Multi-Track Presentation Validations", type: "PRESENTATION_VALIDATION" }
            ],
            isSystem: true,
            status: "ACTIVE",
            installs: 89
        },
        {
            id: "b2",
            name: "Medical Academic Symposium Blueprint",
            industry: "Healthcare",
            description: "Optimized workflow for medical congresses. Includes speaker abstract review portals, Continuing Education (CME) credit certificates, and check-in audits.",
            steps: [
                { order: 1, name: "Deploy Academic Abstract Collection Form", type: "REGISTRATION_FLOW" },
                { order: 2, name: "Provision CME Badge Template", type: "BADGE_TEMPLATE" },
                { order: 3, name: "Enable Certificates of Attendance Auto-Issuance", type: "CERTIFICATE_FLOW" }
            ],
            isSystem: true,
            status: "ACTIVE",
            installs: 45
        },
        {
            id: "b3",
            name: "Corporate Gala & Banquet Blueprint",
            industry: "Corporate",
            description: "Elegant layout blueprint featuring VIP seat planners, table reservation billing, catering inventory alerts, and post-gala photo galleries.",
            steps: [
                { order: 1, name: "Deploy Gala Seating Reservation Site", type: "WEBSITE_TEMPLATE" },
                { order: 2, name: "Enable Catering Menu Hardware/Inventory Billing", type: "INVENTORY_ALLOCATION" },
                { order: 3, name: "Deploy Feedback Survey Template", type: "EMAIL_TEMPLATE" }
            ],
            isSystem: false,
            status: "ACTIVE",
            installs: 12
        }
    ]);
    const filteredBlueprints = useMemo(() => {
        return blueprints.filter((b) => {
            return b.name.toLowerCase().includes(search.toLowerCase()) ||
                b.industry.toLowerCase().includes(search.toLowerCase());
        });
    }, [blueprints, search]);
    const stats = useMemo(() => {
        return [
            { title: "Standard Blueprints", value: blueprints.length, desc: "Active system frameworks", icon: ClipboardList, iconColor: "brand" as const },
            { title: "Blueprint Installs", value: blueprints.reduce((acc, curr) => acc + curr.installs, 0), desc: "Executed deployments", icon: Activity, iconColor: "success" as const },
            { title: "Active Industry Sectors", value: 3, desc: "Tech, Medical, Corporate", icon: Compass, iconColor: "info" as const }
        ];
    }, [blueprints]);
    const handleInstall = (e: React.FormEvent) => {
        e.preventDefault();
        if (!targetOrg) {
            toast.error("Please provide a target Organization UUID or Slug");
            return;
        }
        toast.success(`Installing blueprint '${selectedBlueprint?.name}' onto target tenant org. Running steps...`);
        setShowInstaller(false);
    };
    return (
        <PageContainer>
            <SectionHeader
                title="Blueprint Library"
                description="Provision standard pre-configured templates, workflows, pricing packages, and forms using Blueprint Blueprints."
            />
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {stats.map((stat, idx) => (
                    <KpiCard key={idx} {...stat} />
                ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Side: Blueprints List */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="relative mb-4">
                        <Search className="absolute left-3 top-3 w-4 h-4 text-white/40" />
                        <input
                            type="text"
                            placeholder="Search blueprints by name or sector..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-violet-500 focus:outline-none transition-colors"
                        />
                    </div>
                    <div className="space-y-4">
                        {filteredBlueprints.map((blueprint) => (
                            <div
                                key={blueprint.id}
                                onClick={() => setSelectedBlueprint(blueprint)}
                                className={`p-6 rounded-3xl border transition-all cursor-pointer ${selectedBlueprint?.id === blueprint.id
                                        ? "bg-violet-600/10 border-violet-500 hover:border-violet-400"
                                        : "bg-white/5 border-white/5 hover:border-white/10 hover:bg-white/10"
                                    }`}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-[9px] font-black uppercase tracking-wider text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded">
                                        {blueprint.industry}
                                    </span>
                                    <span className="text-[10px] font-mono text-white/40">
                                        {blueprint.installs} deployments
                                    </span>
                                </div>
                                <h3 className="text-sm font-bold text-white mb-2">{blueprint.name}</h3>
                                <p className="text-[11.5px] text-white/60 leading-relaxed truncate">{blueprint.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
                {/* Right Side: Detail Drawer */}
                <div className="relative">
                    {selectedBlueprint ? (
                        <div className="sticky top-6 p-6 rounded-3xl border border-white/5 bg-white/5 backdrop-blur-lg">
                            <span className="text-[9px] font-black uppercase text-violet-400">{selectedBlueprint.industry} Blueprint</span>
                            <h3 className="text-base font-bold text-white mt-1 mb-4">{selectedBlueprint.name}</h3>
                            <p className="text-xs text-white/60 leading-relaxed mb-6">{selectedBlueprint.description}</p>
                            <h4 className="text-[10px] font-black uppercase text-white/40 tracking-wider mb-3">Deployment Orchestrations</h4>
                            <div className="space-y-3 mb-6">
                                {selectedBlueprint.steps.map((step) => (
                                    <div key={step.order} className="flex gap-3 items-start">
                                        <div className="w-5 h-5 rounded-lg bg-violet-600/20 border border-violet-500/20 text-violet-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                                            {step.order}
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-white/90">{step.name}</p>
                                            <p className="text-[9px] font-mono text-white/40 uppercase">{step.type.replace("_", " ")}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <button
                                onClick={() => setShowInstaller(true)}
                                className="w-full flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-xs font-black uppercase text-white shadow-lg transition-all"
                            >
                                <PlayCircle className="w-4 h-4" /> Provision Blueprint
                            </button>
                        </div>
                    ) : (
                        <div className="p-6 rounded-3xl border border-dashed border-white/10 bg-white/[0.01] text-center flex flex-col items-center justify-center h-64 text-white/40">
                            <ClipboardList className="w-10 h-10 mb-2 opacity-50" />
                            <p className="text-xs font-bold">Select a Blueprint</p>
                            <p className="text-[10px]">Select an industry template to inspect its orchestration steps and install variables.</p>
                        </div>
                    )}
                </div>
            </div>
            {/* Install Overlay Modal */}
            <AnimatePresence>
                {showInstaller && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            onClick={() => setShowInstaller(false)}
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="relative w-full max-w-md p-6 rounded-3xl border border-white/10 bg-zinc-900/90 shadow-2xl backdrop-blur-xl z-10"
                        >
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-sm font-black uppercase text-white flex items-center gap-1.5">
                                    <PlayCircle className="w-4 h-4 text-violet-400" /> Deploy Blueprint Event
                                </h3>
                                <button
                                    onClick={() => setShowInstaller(false)}
                                    className="p-1 rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-colors"
                                >
                                    <Plus className="w-4 h-4 rotate-45" />
                                </button>
                            </div>
                            <form onSubmit={handleInstall} className="space-y-4">
                                <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-300 text-[11px] leading-relaxed flex gap-2.5">
                                    <ShieldAlert className="w-5 h-5 shrink-0 text-amber-400" />
                                    <p>
                                        Deploying a blueprint provisions schemas, initial websites, registration form setups, and catalog items onto the target tenant. This action is irreversible.
                                    </p>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-white/40 mb-1">
                                        Target Tenant Organization UUID / Slug *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={targetOrg}
                                        onChange={(e) => setTargetOrg(e.target.value)}
                                        placeholder="e.g. acme-corp"
                                        className="w-full px-3 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-violet-500 focus:outline-none transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-white/40 mb-1">
                                        Predefined Event Title
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Annual Tech Summit 2026"
                                        className="w-full px-3 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-violet-500 focus:outline-none transition-colors"
                                    />
                                </div>
                                <div className="pt-2 flex justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowInstaller(false)}
                                        className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-white transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-xs font-bold text-white transition-colors shadow-lg"
                                    >
                                        Run Installer
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </PageContainer>
    );
}
