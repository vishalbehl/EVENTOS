"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import {
    ArrowLeft,
    Navigation,
    Plus,
    Save,
    Trash2,
    Sliders,
    MoveUp,
    MoveDown,
    Link2,
    FolderPlus,
    RefreshCw
} from "lucide-react";
import { toast } from "sonner";
interface MenuItem {
    id: string;
    label: string;
    url: string;
    order: number;
}
export default function NavigationBuilderPage() {
    const params = useParams();
    const router = useRouter();
    const siteId = params.id as string;
    const [menuItems, setMenuItems] = useState<MenuItem[]>([
        { id: "n1", label: "Home", url: "/home", order: 1 },
        { id: "n2", label: "Speakers & Panels", url: "/speakers", order: 2 },
        { id: "n3", label: "Event Agenda", url: "/agenda", order: 3 },
        { id: "n4", label: "Register Tickets", url: "/register", order: 4 },
    ]);
    const [newLabel, setNewLabel] = useState("");
    const [newUrl, setNewUrl] = useState("");
    const handleAddItem = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newLabel || !newUrl) {
            toast.error("Please fill in label and URL");
            return;
        }
        const newItem: MenuItem = {
            id: Math.random().toString(),
            label: newLabel,
            url: newUrl,
            order: menuItems.length + 1
        };
        setMenuItems([...menuItems, newItem]);
        toast.success(`Navigation link '${newLabel}' added.`);
        setNewLabel("");
        setNewUrl("");
    };
    const handleMove = (idx: number, direction: "up" | "down") => {
        if (direction === "up" && idx === 0) return;
        if (direction === "down" && idx === menuItems.length - 1) return;
        const swapIdx = direction === "up" ? idx - 1 : idx + 1;
        const copy = [...menuItems];
        const temp = copy[idx];
        copy[idx] = copy[swapIdx];
        copy[swapIdx] = temp;
        setMenuItems(copy);
    };
    const handleDelete = (id: string) => {
        setMenuItems(menuItems.filter(item => item.id !== id));
        toast.success("Navigation item deleted.");
    };
    const handleSave = () => {
        toast.success("Navigation menu hierarchy successfully saved.");
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
                title="Navigation Builder"
                description="Configure header/footer navigation items, custom link routers, and sort order hierarchies."
                actions={
                    <button
                        onClick={handleSave}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-xs font-black uppercase text-white shadow-lg transition-all"
                    >
                        <Save className="w-3.5 h-3.5" /> Save Menu Setup
                    </button>
                }
            />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Side: Navigation Item Hierarchy list */}
                <div className="lg:col-span-2 p-6 rounded-3xl border border-white/5 bg-white/5 backdrop-blur-lg">
                    <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-1.5">
                        <Navigation className="w-4 h-4 text-violet-400" /> Header Menu Items
                    </h3>
                    <div className="space-y-3">
                        {menuItems.map((item, idx) => (
                            <div
                                key={item.id}
                                className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-violet-500/20 transition-all group"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-6 h-6 rounded-lg bg-zinc-800 border border-white/5 text-white/40 flex items-center justify-center text-[10px] font-mono shrink-0">
                                        {idx + 1}
                                    </div>
                                    <div>
                                        <h4 className="text-xs font-bold text-white">{item.label}</h4>
                                        <span className="text-[10px] font-mono text-white/40">{item.url}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <button
                                        disabled={idx === 0}
                                        onClick={() => handleMove(idx, "up")}
                                        className="p-1 rounded hover:bg-white/5 text-white/40 hover:text-white disabled:opacity-30 transition-all"
                                    >
                                        <MoveUp className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        disabled={idx === menuItems.length - 1}
                                        onClick={() => handleMove(idx, "down")}
                                        className="p-1 rounded hover:bg-white/5 text-white/40 hover:text-white disabled:opacity-30 transition-all"
                                    >
                                        <MoveDown className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(item.id)}
                                        className="p-1 rounded hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-all"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                {/* Right Side: Add Item form */}
                <div className="p-6 rounded-3xl border border-white/5 bg-white/5 backdrop-blur-lg h-fit">
                    <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-1.5">
                        <FolderPlus className="w-4 h-4 text-violet-400" /> Add Navigation Link
                    </h3>
                    <form onSubmit={handleAddItem} className="space-y-4">
                        <div>
                            <label className="block text-[9px] font-black uppercase text-white/40 mb-1">
                                Link Label *
                            </label>
                            <input
                                type="text"
                                required
                                value={newLabel}
                                onChange={(e) => setNewLabel(e.target.value)}
                                placeholder="e.g. Speaker Board"
                                className="w-full px-3 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-violet-500 focus:outline-none transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-[9px] font-black uppercase text-white/40 mb-1">
                                Router URL *
                            </label>
                            <div className="relative">
                                <Link2 className="absolute left-3 top-2.5 w-3.5 h-3.5 text-white/40" />
                                <input
                                    type="text"
                                    required
                                    value={newUrl}
                                    onChange={(e) => setNewUrl(e.target.value)}
                                    placeholder="/speakers"
                                    className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-violet-500 focus:outline-none transition-colors"
                                />
                            </div>
                        </div>
                        <button
                            type="submit"
                            className="w-full flex items-center justify-center gap-1 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-xs font-black uppercase text-white shadow-lg transition-colors"
                        >
                            <Plus className="w-3.5 h-3.5" /> Add Link Item
                        </button>
                    </form>
                </div>
            </div>
        </PageContainer>
    );
}