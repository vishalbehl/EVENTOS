"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import {
    ArrowLeft,
    Layout,
    Plus,
    Save,
    CheckCircle,
    Eye,
    Sliders,
    MoveUp,
    MoveDown,
    Trash2,
    Settings,
    PlusCircle,
    Sparkles,
    FileCode,
    LayoutGrid
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
interface PageSection {
    id: string;
    type: string;
    settings: Record<string, any>;
}
export default function SiteEditorPage() {
    const params = useParams();
    const router = useRouter();
    const siteId = params.id as string;
    const [activePage, setActivePage] = useState("Home");
    const [showAddSectionModal, setShowAddSectionModal] = useState(false);
    const [selectedSectionId, setSelectedSectionId] = useState<string | null>("sec-1");
    // Page sections state
    const [sections, setSections] = useState<PageSection[]>([
        { id: "sec-1", type: "HERO", settings: { headline: "Welcome to Annual Tech Summit 2026", cta_text: "Register Now", bg_opacity: "40%" } },
        { id: "sec-2", type: "COUNTDOWN", settings: { date: "2026-10-15T09:00:00Z", label: "Event Begins In" } },
        { id: "sec-3", type: "AGENDA", settings: { show_speakers: true, filter_track: "ALL" } },
    ]);
    const handleMoveSection = (idx: number, dir: "up" | "down") => {
        if (dir === "up" && idx === 0) return;
        if (dir === "down" && idx === sections.length - 1) return;
        const nextIdx = dir === "up" ? idx - 1 : idx + 1;
        const newSections = [...sections];
        const temp = newSections[idx];
        newSections[idx] = newSections[nextIdx];
        newSections[nextIdx] = temp;
        setSections(newSections);
        toast.success("Section order rearranged.");
    };
    const handleDeleteSection = (id: string) => {
        setSections(sections.filter(s => s.id !== id));
        toast.success("Section removed from page draft.");
        if (selectedSectionId === id) {
            setSelectedSectionId(null);
        }
    };
    const handleAddSection = (type: string) => {
        const defaultSettings: Record<string, Record<string, any>> = {
            HERO: { headline: "Join the Future of Technology", cta_text: "Get Tickets", bg_opacity: "50%" },
            COUNTDOWN: { date: "2026-12-31T23:59:59Z", label: "Days Left" },
            AGENDA: { show_speakers: true, filter_track: "ALL" },
            SPONSORS: { title: "Our Sponsors", tier: "Gold" },
            FAQ: { title: "Frequently Asked Questions" }
        };
        const newSec: PageSection = {
            id: Math.random().toString(),
            type,
            settings: defaultSettings[type] || {}
        };
        setSections([...sections, newSec]);
        toast.success(`Section ${type} added.`);
        setShowAddSectionModal(false);
    };
    const handleUpdateSetting = (key: string, val: any) => {
        setSections(prev =>
            prev.map(sec => {
                if (sec.id === selectedSectionId) {
                    return { ...sec, settings: { ...sec.settings, [key]: val } };
                }
                return sec;
            })
        );
    };
    const activeSection = sections.find(s => s.id === selectedSectionId);
    return (
        <PageContainer>
            <div className="mb-4 flex items-center justify-between">
                <button
                    onClick={() => router.push("/super-admin/builder/sites")}
                    className="inline-flex items-center gap-1 text-[11px] font-black uppercase text-violet-400 hover:text-white transition-colors"
                >
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
                </button>
                <div className="flex gap-2">
                    <button
                        onClick={() => toast.success("Draft saved to Database.")}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 text-xs font-bold text-white transition-colors"
                    >
                        <Save className="w-3.5 h-3.5" /> Save Draft
                    </button>
                    <button
                        onClick={() => toast.success("Page published successfully to live URL.")}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-xs font-black uppercase text-white shadow-lg transition-colors"
                    >
                        <CheckCircle className="w-3.5 h-3.5" /> Publish Page
                    </button>
                </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-230px)] items-stretch">
                {/* Panel 1: Pages Selector */}
                <div className="p-5 rounded-3xl border border-white/5 bg-white/5 backdrop-blur-lg flex flex-col justify-between">
                    <div>
                        <h3 className="text-xs font-black uppercase text-white/40 mb-3 tracking-wider">Site Pages</h3>
                        <div className="space-y-1.5">
                            {["Home", "Registration Flow", "Speaker Agenda", "Sponsors list", "Venue Map"].map(p => (
                                <button
                                    key={p}
                                    onClick={() => setActivePage(p)}
                                    className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activePage === p
                                            ? "bg-violet-600 text-white shadow-md shadow-violet-600/20"
                                            : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                                        }`}
                                >
                                    <Layout className="w-3.5 h-3.5" /> {p}
                                </button>
                            ))}
                        </div>
                    </div>
                    <button
                        onClick={() => toast.success("Created new Page object.")}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-dashed border-white/15 hover:border-white/30 text-xs font-bold text-white/70 hover:text-white transition-all mt-4"
                    >
                        <Plus className="w-3.5 h-3.5" /> Add New Page
                    </button>
                </div>
                {/* Panel 2: Central Canvas Preview */}
                <div className="lg:col-span-2 p-5 rounded-3xl border border-white/5 bg-zinc-950 flex flex-col overflow-y-auto no-scrollbar relative">
                    <div className="flex justify-between items-center pb-4 mb-4 border-b border-white/5">
                        <span className="text-[10px] font-black uppercase text-white/40 tracking-wider">Canvas Editor</span>
                        <span className="text-xs text-white/60 font-mono">Editing: /{activePage.toLowerCase().replace(" ", "-")}</span>
                    </div>
                    <div className="flex-1 space-y-4">
                        {sections.map((sec, idx) => (
                            <div
                                key={sec.id}
                                onClick={() => setSelectedSectionId(sec.id)}
                                className={`relative p-5 rounded-2xl border transition-all cursor-pointer group ${selectedSectionId === sec.id
                                        ? "bg-violet-500/10 border-violet-500"
                                        : "bg-white/5 border-white/5 hover:border-white/10"
                                    }`}
                            >
                                {/* Control Handles overlay on hover */}
                                <div className="absolute right-3 top-3 hidden group-hover:flex items-center gap-1 bg-zinc-900 border border-white/10 p-1 rounded-lg z-10">
                                    <button onClick={(e) => { e.stopPropagation(); handleMoveSection(idx, "up"); }} className="p-1 hover:bg-white/5 text-white/50 hover:text-white rounded" disabled={idx === 0}>
                                        <MoveUp className="w-3 h-3" />
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); handleMoveSection(idx, "down"); }} className="p-1 hover:bg-white/5 text-white/50 hover:text-white rounded" disabled={idx === sections.length - 1}>
                                        <MoveDown className="w-3 h-3" />
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteSection(sec.id); }} className="p-1 hover:bg-red-500/20 text-red-400 rounded">
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </div>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-[9px] font-black uppercase text-violet-400 bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 rounded">
                                        {sec.type}
                                    </span>
                                </div>
                                {sec.type === "HERO" && (
                                    <div className="text-center py-6">
                                        <h4 className="text-sm font-bold text-white mb-2">{sec.settings.headline}</h4>
                                        <span className="text-[10px] bg-violet-600 px-3 py-1 rounded-full font-bold text-white">{sec.settings.cta_text}</span>
                                    </div>
                                )}
                                {sec.type === "COUNTDOWN" && (
                                    <div className="text-center py-4 bg-zinc-900 rounded-xl border border-white/5">
                                        <p className="text-[9px] uppercase tracking-wider text-white/30">{sec.settings.label}</p>
                                        <p className="text-base font-black text-violet-400 font-mono mt-1">2d : 14h : 05m : 33s</p>
                                    </div>
                                )}
                                {sec.type === "AGENDA" && (
                                    <div className="p-4 bg-zinc-900 rounded-xl border border-white/5 space-y-2">
                                        <div className="h-2 w-16 bg-white/20 rounded" />
                                        <div className="h-3 w-40 bg-white/10 rounded" />
                                        <div className="h-2 w-32 bg-white/5 rounded" />
                                    </div>
                                )}
                                {!["HERO", "COUNTDOWN", "AGENDA"].includes(sec.type) && (
                                    <div className="py-4 text-center text-xs text-white/40">
                                        Preset block template render mockup.
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                    <button
                        onClick={() => setShowAddSectionModal(true)}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-3 rounded-2xl border border-dashed border-white/15 hover:border-violet-500/30 text-xs font-bold text-white/50 hover:text-violet-400 transition-all mt-4"
                    >
                        <PlusCircle className="w-4 h-4" /> Add Section Block
                    </button>
                </div>
                {/* Panel 3: Settings Editor Sidebar */}
                <div className="p-5 rounded-3xl border border-white/5 bg-white/5 backdrop-blur-lg flex flex-col">
                    {activeSection ? (
                        <div className="space-y-4">
                            <h3 className="text-xs font-black uppercase text-white/40 tracking-wider mb-2 flex items-center gap-1">
                                <Sliders className="w-3.5 h-3.5" /> Block Settings
                            </h3>
                            <p className="text-[10px] font-mono text-violet-400 uppercase">{activeSection.type} Block</p>
                            {activeSection.type === "HERO" && (
                                <>
                                    <div>
                                        <label className="block text-[9.5px] font-black uppercase text-white/40 mb-1">Headline Text</label>
                                        <input
                                            type="text"
                                            value={activeSection.settings.headline || ""}
                                            onChange={(e) => handleUpdateSetting("headline", e.target.value)}
                                            className="w-full px-3 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-white focus:outline-none focus:border-violet-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[9.5px] font-black uppercase text-white/40 mb-1">CTA Label</label>
                                        <input
                                            type="text"
                                            value={activeSection.settings.cta_text || ""}
                                            onChange={(e) => handleUpdateSetting("cta_text", e.target.value)}
                                            className="w-full px-3 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-white focus:outline-none focus:border-violet-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[9.5px] font-black uppercase text-white/40 mb-1">Background Opacity</label>
                                        <input
                                            type="text"
                                            value={activeSection.settings.bg_opacity || ""}
                                            onChange={(e) => handleUpdateSetting("bg_opacity", e.target.value)}
                                            className="w-full px-3 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-white focus:outline-none focus:border-violet-500"
                                        />
                                    </div>
                                </>
                            )}
                            {activeSection.type === "COUNTDOWN" && (
                                <>
                                    <div>
                                        <label className="block text-[9.5px] font-black uppercase text-white/40 mb-1">Countdown Label</label>
                                        <input
                                            type="text"
                                            value={activeSection.settings.label || ""}
                                            onChange={(e) => handleUpdateSetting("label", e.target.value)}
                                            className="w-full px-3 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-white focus:outline-none focus:border-violet-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[9.5px] font-black uppercase text-white/40 mb-1">Target Date</label>
                                        <input
                                            type="text"
                                            value={activeSection.settings.date || ""}
                                            onChange={(e) => handleUpdateSetting("date", e.target.value)}
                                            className="w-full px-3 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-white focus:outline-none focus:border-violet-500"
                                        />
                                    </div>
                                </>
                            )}
                            {activeSection.type === "AGENDA" && (
                                <>
                                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                                        <span className="text-[10px] font-black uppercase text-white/60">Show Speaker Details</span>
                                        <input
                                            type="checkbox"
                                            checked={!!activeSection.settings.show_speakers}
                                            onChange={(e) => handleUpdateSetting("show_speakers", e.target.checked)}
                                            className="w-4 h-4 rounded accent-violet-600 focus:outline-none"
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="text-center text-white/40 my-auto">
                            <Settings className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-xs font-bold">No Block Selected</p>
                            <p className="text-[10px]">Select a layout section block on the canvas to configure settings.</p>
                        </div>
                    )}
                </div>
            </div>
            {/* Add Section Overlay Modal */}
            <AnimatePresence>
                {showAddSectionModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            onClick={() => setShowAddSectionModal(false)}
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="relative w-full max-w-lg p-6 rounded-3xl border border-white/10 bg-zinc-900/90 shadow-2xl backdrop-blur-xl z-10"
                        >
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-sm font-black uppercase text-white flex items-center gap-1.5">
                                    <LayoutGrid className="w-4 h-4 text-violet-400" /> Insert Component Preset Block
                                </h3>
                                <button
                                    onClick={() => setShowAddSectionModal(false)}
                                    className="p-1 rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-colors"
                                >
                                    <Plus className="w-4 h-4 rotate-45" />
                                </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[350px] overflow-y-auto no-scrollbar">
                                {[
                                    { type: "HERO", name: "Hero Landing Grid", desc: "Bold header title, CTA buttons, and background sliders." },
                                    { type: "COUNTDOWN", name: "Event Countdown", desc: "Ticking counters to start dates." },
                                    { type: "AGENDA", name: "Tracks/Speaker Schedule", desc: "Multi-track timeline lists." },
                                    { type: "SPONSORS", name: "Sponsors Tier Grid", desc: "Tiered logo grids with external links." },
                                    { type: "FAQ", name: "FAQ Collapsible Accordion", desc: "Collapsible questions list." }
                                ].map((b) => (
                                    <div
                                        key={b.type}
                                        onClick={() => handleAddSection(b.type)}
                                        className="p-4 rounded-2xl border border-white/5 bg-white/5 hover:border-violet-500/20 hover:bg-white/10 cursor-pointer transition-all flex flex-col justify-between"
                                    >
                                        <div>
                                            <h4 className="text-xs font-bold text-white mb-1">{b.name}</h4>
                                            <p className="text-[10px] text-white/50 leading-relaxed">{b.desc}</p>
                                        </div>
                                        <span className="text-[8px] font-black uppercase tracking-wider text-violet-400 mt-3 block">
                                            Insert Block
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </PageContainer>
    );
}