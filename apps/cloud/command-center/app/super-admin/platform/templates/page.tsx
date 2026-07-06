"use client";
import { useState, useMemo } from "react";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { KpiCard } from "@/components/super-admin/ui/KpiCard";
import { DataTable } from "@/components/super-admin/ui/DataTable";
import {
    FileText,
    Plus,
    Search,
    SlidersHorizontal,
    Layers,
    Award,
    CreditCard,
    Mail,
    Eye,
    Settings,
    ShoppingBag,
    Sparkles,
    RefreshCw,
    FolderOpen
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
interface Template {
    id: string;
    name: string;
    category: string;
    type: string;
    status: string;
    version: string;
    installs: number;
    rating: number;
    isSystem: boolean;
}
export default function TemplatesPage() {
    const [search, setSearch] = useState("");
    const [selectedType, setSelectedType] = useState("ALL");
    const [showCreateModal, setShowCreateModal] = useState(false);
    // Mock template list
    const [templates, setTemplates] = useState<Template[]>([
        { id: "1", name: "Sleek Tech Conference Theme", category: "Websites", type: "WEBSITE", status: "PUBLISHED", version: "v2.1.0", installs: 145, rating: 4.8, isSystem: true },
        { id: "2", name: "Medical Summit Registration Form", category: "Forms", type: "REGISTRATION_FORM", status: "PUBLISHED", version: "v1.0.5", installs: 88, rating: 4.5, isSystem: true },
        { id: "3", name: "VIP attendee Badge Portrait", category: "Badges", type: "BADGE", status: "PUBLISHED", version: "v1.2.0", installs: 230, rating: 4.9, isSystem: false },
        { id: "4", name: "Speaker Honor Certificate", category: "Certificates", type: "CERTIFICATE", status: "DRAFT", version: "v0.9.0", installs: 0, rating: 0, isSystem: false },
        { id: "5", name: "Post-Event Feedback Survey Email", category: "Emails", type: "EMAIL", status: "PUBLISHED", version: "v1.0.0", installs: 412, rating: 4.7, isSystem: true },
        { id: "6", name: "Modern Glassmorphism Summit Layout", category: "Websites", type: "WEBSITE", status: "PUBLISHED", version: "v1.1.0", installs: 74, rating: 4.6, isSystem: false },
    ]);
    const [formData, setFormData] = useState({
        name: "",
        type: "WEBSITE",
        category: "Websites",
        description: "",
    });
    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name) {
            toast.error("Please provide a template name");
            return;
        }
        const newTemplate: Template = {
            id: Math.random().toString(),
            name: formData.name,
            category: formData.category,
            type: formData.type,
            status: "DRAFT",
            version: "v1.0.0",
            installs: 0,
            rating: 0,
            isSystem: false,
        };
        setTemplates([newTemplate, ...templates]);
        toast.success("Template created successfully in draft mode.");
        setShowCreateModal(false);
        setFormData({ name: "", type: "WEBSITE", category: "Websites", description: "" });
    };
    const filteredTemplates = useMemo(() => {
        return templates.filter((t) => {
            const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase()) ||
                t.category.toLowerCase().includes(search.toLowerCase());
            const matchesType = selectedType === "ALL" || t.type === selectedType;
            return matchesSearch && matchesType;
        });
    }, [templates, search, selectedType]);
    const stats = useMemo(() => {
        return [
            { title: "Total Templates", value: templates.length, desc: "System & custom designs", icon: Layers, iconColor: "brand" as const },
            { title: "Total Installs", value: templates.reduce((acc, curr) => acc + curr.installs, 0), desc: "Across all event sites", icon: Sparkles, iconColor: "success" as const },
            { title: "Marketplace Listings", value: templates.filter(t => !t.isSystem && t.status === "PUBLISHED").length, desc: "Ready for distribution", icon: ShoppingBag, iconColor: "info" as const },
        ];
    }, [templates]);
    return (
        <PageContainer>
            <SectionHeader
                title="Templates Console"
                description="Design and manage website, form, badge, certificate, and email templates for global events."
                actions={
                    <div className="flex gap-2">
                        <Link
                            href="/super-admin/platform/templates/marketplace"
                            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-violet-500/20 bg-violet-500/10 hover:bg-violet-500/20 text-xs font-black uppercase text-violet-300 shadow-md transition-all"
                        >
                            <ShoppingBag className="w-3.5 h-3.5" /> Template Marketplace
                        </Link>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-xs font-black uppercase text-white shadow-lg transition-all"
                        >
                            <Plus className="w-3.5 h-3.5" /> Design Template
                        </button>
                    </div>
                }
            />
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {stats.map((stat, idx) => (
                    <KpiCard key={idx} {...stat} />
                ))}
            </div>
            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between p-4 rounded-2xl border border-white/5 bg-white/5 backdrop-blur-md mb-6">
                <div className="relative w-full sm:w-80">
                    <Search className="absolute left-3 top-3 w-4 h-4 text-white/40" />
                    <input
                        type="text"
                        placeholder="Search templates..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-violet-500 focus:outline-none transition-colors"
                    />
                </div>
                <div className="flex gap-2 w-full sm:w-auto overflow-x-auto no-scrollbar">
                    {["ALL", "WEBSITE", "REGISTRATION_FORM", "BADGE", "CERTIFICATE", "EMAIL"].map((type) => (
                        <button
                            key={type}
                            onClick={() => setSelectedType(type)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors shrink-0 ${selectedType === type
                                    ? "bg-violet-600 text-white"
                                    : "bg-white/5 border border-white/10 text-white/70 hover:bg-white/10"
                                }`}
                        >
                            {type.replace("_", " ")}
                        </button>
                    ))}
                </div>
            </div>
            {/* Templates Grid List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredTemplates.map((template) => (
                    <div
                        key={template.id}
                        className="relative flex flex-col justify-between p-6 rounded-3xl border border-white/5 bg-white/5 backdrop-blur-lg hover:border-violet-500/20 hover:bg-white/10 transition-all duration-300 group shadow-lg"
                    >
                        <div>
                            <div className="flex justify-between items-start mb-4">
                                <div className="p-2 rounded-xl bg-violet-600/20 border border-violet-500/20 text-violet-300">
                                    {template.type === "WEBSITE" && <Layers className="w-5 h-5" />}
                                    {template.type === "REGISTRATION_FORM" && <FileText className="w-5 h-5" />}
                                    {template.type === "BADGE" && <CreditCard className="w-5 h-5" />}
                                    {template.type === "CERTIFICATE" && <Award className="w-5 h-5" />}
                                    {template.type === "EMAIL" && <Mail className="w-5 h-5" />}
                                </div>
                                <div className="flex items-center gap-1.5">
                                    {template.isSystem && (
                                        <span className="text-[8px] font-black uppercase bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">
                                            SYSTEM
                                        </span>
                                    )}
                                    <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${template.status === "PUBLISHED"
                                            ? "bg-violet-500/10 border border-violet-500/20 text-violet-400"
                                            : "bg-amber-500/10 border border-amber-500/20 text-amber-400"
                                        }`}>
                                        {template.status}
                                    </span>
                                </div>
                            </div>
                            <h3 className="text-[14px] font-bold text-white mb-1 group-hover:text-violet-300 transition-colors">
                                {template.name}
                            </h3>
                            <p className="text-[11px] text-white/50 mb-4">{template.category} • {template.version}</p>
                        </div>
                        <div className="border-t border-white/5 pt-4 mt-2 flex justify-between items-center">
                            <span className="text-[11px] font-mono text-white/40">
                                {template.installs} global installs
                            </span>
                            <div className="flex gap-1.5">
                                <button
                                    className="p-1.5 rounded-lg border border-white/5 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                                    title="Configure Template Schema"
                                >
                                    <Settings className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    className="p-1.5 rounded-lg border border-white/5 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                                    title="Preview"
                                >
                                    <Eye className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            {/* Create Modal */}
            <AnimatePresence>
                {showCreateModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            onClick={() => setShowCreateModal(false)}
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="relative w-full max-w-md p-6 rounded-3xl border border-white/10 bg-zinc-900/90 shadow-2xl backdrop-blur-xl z-10"
                        >
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-sm font-black uppercase text-white flex items-center gap-1.5">
                                    <Plus className="w-4 h-4 text-violet-400" /> New Event Template
                                </h3>
                                <button
                                    onClick={() => setShowCreateModal(false)}
                                    className="p-1 rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-colors"
                                >
                                    <Plus className="w-4 h-4 rotate-45" />
                                </button>
                            </div>
                            <form onSubmit={handleCreate} className="space-y-4">
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-white/40 mb-1">
                                        Template Name *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="e.g. VIP Gala Website Theme"
                                        className="w-full px-3 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-violet-500 focus:outline-none transition-colors"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black uppercase text-white/40 mb-1">
                                            Template Type
                                        </label>
                                        <select
                                            value={formData.type}
                                            onChange={(e) => {
                                                const type = e.target.value;
                                                const catMap: Record<string, string> = {
                                                    WEBSITE: "Websites",
                                                    REGISTRATION_FORM: "Forms",
                                                    BADGE: "Badges",
                                                    CERTIFICATE: "Certificates",
                                                    EMAIL: "Emails"
                                                };
                                                setFormData({ ...formData, type, category: catMap[type] || "Websites" });
                                            }}
                                            className="w-full px-3 py-2 rounded-xl text-xs bg-zinc-800 border border-white/10 text-white focus:border-violet-500 focus:outline-none transition-colors"
                                        >
                                            <option value="WEBSITE">Website Theme</option>
                                            <option value="REGISTRATION_FORM">Registration Form</option>
                                            <option value="BADGE">Event Badge</option>
                                            <option value="CERTIFICATE">Certificate</option>
                                            <option value="EMAIL">Email Template</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black uppercase text-white/40 mb-1">
                                            Category Group
                                        </label>
                                        <input
                                            type="text"
                                            disabled
                                            value={formData.category}
                                            className="w-full px-3 py-2 rounded-xl text-xs bg-white/5 border border-white/5 text-white/40"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-white/40 mb-1">
                                        Short Description
                                    </label>
                                    <textarea
                                        rows={3}
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        placeholder="Enter template design specs, theme colors, or target audiences..."
                                        className="w-full px-3 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-violet-500 focus:outline-none transition-colors"
                                    />
                                </div>
                                <div className="pt-2 flex justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowCreateModal(false)}
                                        className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-white transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-xs font-bold text-white transition-colors shadow-lg shadow-violet-600/30"
                                    >
                                        Provision
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