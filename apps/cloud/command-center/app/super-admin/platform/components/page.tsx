"use client";
import { useState } from "react";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { KpiCard } from "@/components/super-admin/ui/KpiCard";
import {
    Box,
    Eye,
    Settings,
    Sliders,
    Plus,
    Save,
    CheckCircle,
    FileCode,
    Sparkles,
    Search,
    LayoutGrid,
    FileText,
    Clock,
    HelpCircle
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
interface ComponentBlock {
    id: string;
    name: string;
    type: string;
    description: string;
    schemaFieldsCount: number;
}
export default function ComponentLibraryPage() {
    const [search, setSearch] = useState("");
    const [selectedBlock, setSelectedBlock] = useState<ComponentBlock | null>(null);
    const [blocks] = useState<ComponentBlock[]>([
        { id: "c1", name: "Modern Hero Banner Grid", type: "HERO", description: "Glassmorphic hero banner with title, CTA actions, custom background video url, and social share buttons.", schemaFieldsCount: 5 },
        { id: "c2", name: "Multi-Track Speakers Accordion", type: "AGENDA", description: "Displays dynamic agenda segments with filter tabs, speaker photo bubbles, room IDs, and description cards.", schemaFieldsCount: 8 },
        { id: "c3", name: "Dynamic Event Countdown Timer", type: "COUNTDOWN", description: "Displays day/hour/minute/second counters ticking down to target event start timestamp.", schemaFieldsCount: 3 },
        { id: "c4", name: "Sponsors Tier Grid Logo Banner", type: "SPONSORS", description: "Arranges sponsor logo assets in tiers (Platinum, Gold, Silver) with responsive grid sizing.", schemaFieldsCount: 4 },
        { id: "c5", name: "Accordion FAQ Component", type: "FAQ", description: "Simple collapsible questions and answers list to address event ticket policies, venue access, etc.", schemaFieldsCount: 2 }
    ]);
    const filteredBlocks = blocks.filter(b => {
        return b.name.toLowerCase().includes(search.toLowerCase()) ||
            b.type.toLowerCase().includes(search.toLowerCase());
    });
    return (
        <PageContainer>
            <SectionHeader
                title="Component Presets"
                description="Build custom layout components for pages. Declare schemas, input attributes, and style templates."
            />
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <KpiCard title="Active Core Blocks" value={blocks.length} deltaLabel="Available in Page Builder" icon={Box} iconColor="brand" />
                <KpiCard title="Schema Definitions" value={22} deltaLabel="Dynamic config parameters" icon={FileCode} iconColor="success" />
                <KpiCard title="Custom Block Styles" value={14} deltaLabel="Global HSL layouts mapped" icon={Sliders} iconColor="info" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Side: Blocks List */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="relative mb-4">
                        <Search className="absolute left-3 top-3 w-4 h-4 text-white/40" />
                        <input
                            type="text"
                            placeholder="Search component presets..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-violet-500 focus:outline-none transition-colors"
                        />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredBlocks.map((block) => (
                            <div
                                key={block.id}
                                onClick={() => setSelectedBlock(block)}
                                className={`p-5 rounded-3xl border transition-all cursor-pointer flex flex-col justify-between ${selectedBlock?.id === block.id
                                        ? "bg-violet-600/10 border-violet-500"
                                        : "bg-white/5 border-white/5 hover:border-white/10 hover:bg-white/10"
                                    }`}
                            >
                                <div>
                                    <div className="flex justify-between items-start mb-3">
                                        <span className="text-[9px] font-black uppercase tracking-wider text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded">
                                            {block.type}
                                        </span>
                                        <span className="text-[10px] text-white/40">
                                            {block.schemaFieldsCount} attributes
                                        </span>
                                    </div>
                                    <h3 className="text-xs font-bold text-white mb-2">{block.name}</h3>
                                    <p className="text-[11px] text-white/50 leading-relaxed mb-4">{block.description}</p>
                                </div>
                                <div className="flex gap-2 justify-end border-t border-white/5 pt-3">
                                    <button className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all text-[10px] font-bold flex items-center gap-1">
                                        <Eye className="w-3 h-3" /> Preview
                                    </button>
                                    <button className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all text-[10px] font-bold flex items-center gap-1">
                                        <Settings className="w-3 h-3" /> Config
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                {/* Right Side: Schema Editor View */}
                <div>
                    {selectedBlock ? (
                        <div className="sticky top-6 p-6 rounded-3xl border border-white/5 bg-white/5 backdrop-blur-lg">
                            <span className="text-[9px] font-black uppercase text-violet-400">{selectedBlock.type} Schema</span>
                            <h3 className="text-sm font-bold text-white mt-1 mb-4">{selectedBlock.name}</h3>
                            <div className="space-y-4 mb-6">
                                <div>
                                    <span className="text-[9px] font-black uppercase text-white/40 mb-1 block">Component Attributes</span>
                                    <div className="space-y-1.5">
                                        {selectedBlock.type === "HERO" && (
                                            <>
                                                <div className="flex justify-between text-xs p-2 rounded bg-zinc-800 border border-white/5 font-mono"><span className="text-violet-300">headline</span><span className="text-white/40">Text (Required)</span></div>
                                                <div className="flex justify-between text-xs p-2 rounded bg-zinc-800 border border-white/5 font-mono"><span className="text-violet-300">ctaText</span><span className="text-white/40">Text (Optional)</span></div>
                                                <div className="flex justify-between text-xs p-2 rounded bg-zinc-800 border border-white/5 font-mono"><span className="text-violet-300">bgVideoUrl</span><span className="text-white/40">URL (Optional)</span></div>
                                            </>
                                        )}
                                        {selectedBlock.type === "AGENDA" && (
                                            <>
                                                <div className="flex justify-between text-xs p-2 rounded bg-zinc-800 border border-white/5 font-mono"><span className="text-violet-300">showSpeakers</span><span className="text-white/40">Boolean (Default: true)</span></div>
                                                <div className="flex justify-between text-xs p-2 rounded bg-zinc-800 border border-white/5 font-mono"><span className="text-violet-300">trackFilter</span><span className="text-white/40">Select (Dropdown)</span></div>
                                            </>
                                        )}
                                        {selectedBlock.type === "COUNTDOWN" && (
                                            <>
                                                <div className="flex justify-between text-xs p-2 rounded bg-zinc-800 border border-white/5 font-mono"><span className="text-violet-300">targetTimestamp</span><span className="text-white/40">DateTime (Required)</span></div>
                                            </>
                                        )}
                                        {(!["HERO", "AGENDA", "COUNTDOWN"].includes(selectedBlock.type)) && (
                                            <div className="text-xs text-white/40">Standard preset variables registered.</div>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <span className="text-[9px] font-black uppercase text-white/40 mb-1 block">Schema JSON Spec</span>
                                    <pre className="text-[10px] font-mono text-emerald-400 bg-zinc-950 p-3 rounded-xl border border-white/5 overflow-x-auto h-40">
                                        {JSON.stringify({
                                            component_type: selectedBlock.type,
                                            properties: {
                                                headline: { type: "string", default: "My Event Headline" },
                                                cta_text: { type: "string", default: "Register Now" }
                                            },
                                            styles: {
                                                background_color: "transparent",
                                                padding_y: "large"
                                            }
                                        }, null, 2)}
                                    </pre>
                                </div>
                            </div>
                            <button
                                onClick={() => toast.success("JSON component schema settings updated.")}
                                className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-xs font-black uppercase text-white shadow-lg transition-all"
                            >
                                <Save className="w-3.5 h-3.5" /> Save Schema Spec
                            </button>
                        </div>
                    ) : (
                        <div className="p-6 rounded-3xl border border-dashed border-white/10 bg-white/[0.01] text-center flex flex-col items-center justify-center h-64 text-white/40">
                            <Box className="w-10 h-10 mb-2 opacity-50" />
                            <p className="text-xs font-bold">Select a Component Preset</p>
                            <p className="text-[10px]">Select a block from the library to configure its layout properties, type options, or JSON schemas.</p>
                        </div>
                    )}
                </div>
            </div>
        </PageContainer>
    );
}
