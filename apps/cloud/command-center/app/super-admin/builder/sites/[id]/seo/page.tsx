"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import {
    ArrowLeft,
    Sliders,
    Plus,
    Save,
    Trash2,
    SearchCode,
    Globe,
    Settings,
    Link,
    PlusCircle,
    HelpCircle,
    Tag
} from "lucide-react";
import { toast } from "sonner";
interface RedirectRule {
    id: string;
    source: string;
    target: string;
    code: number;
}
export default function SeoRedirectsPage() {
    const params = useParams();
    const router = useRouter();
    const siteId = params.id as string;
    const [metaTitle, setMetaTitle] = useState("Annual Technology Summit 2026");
    const [metaDesc, setMetaDesc] = useState("Join the premier gathering of software engineers, product managers, and technology leaders.");
    const [ogImage, setOgImage] = useState("https://cdn.eventx.com/images/og-techsummit.png");
    const [redirects, setRedirects] = useState<RedirectRule[]>([
        { id: "r1", source: "/tickets", target: "/register", code: 301 },
        { id: "r2", source: "/agenda-pdf", target: "/agenda", code: 302 },
    ]);
    const [newSource, setNewSource] = useState("");
    const [newTarget, setNewTarget] = useState("");
    const [newCode, setNewCode] = useState(301);
    const handleAddRedirect = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newSource || !newTarget) {
            toast.error("Please fill in source and target paths");
            return;
        }
        const rule: RedirectRule = {
            id: Math.random().toString(),
            source: newSource,
            target: newTarget,
            code: newCode
        };
        setRedirects([...redirects, rule]);
        toast.success(`Redirect rule '${newSource} -> ${newTarget}' created.`);
        setNewSource("");
        setNewTarget("");
    };
    const handleDeleteRedirect = (id: string) => {
        setRedirects(redirects.filter(r => r.id !== id));
        toast.success("Redirect rule deleted.");
    };
    const handleSaveSeo = () => {
        toast.success("Meta attributes and sitemap configurations saved successfully.");
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
                title="SEO & Redirects Console"
                description="Configure meta tags, OpenGraph imagery, robot crawling, and permanent/temporary redirect routing."
                actions={
                    <button
                        onClick={handleSaveSeo}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-xs font-black uppercase text-white shadow-lg transition-all"
                    >
                        <Save className="w-3.5 h-3.5" /> Save Changes
                    </button>
                }
            />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Side: Metadata and OpenGraph */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Metadata Card */}
                    <div className="p-6 rounded-3xl border border-white/5 bg-white/5 backdrop-blur-lg">
                        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-1.5">
                            <SearchCode className="w-4 h-4 text-violet-400" /> Header Metadata
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-black uppercase text-white/40 mb-1">
                                    Global Meta Title (Max 60 chars)
                                </label>
                                <input
                                    type="text"
                                    value={metaTitle}
                                    onChange={(e) => setMetaTitle(e.target.value)}
                                    className="w-full px-3 py-2.5 rounded-xl text-xs bg-white/5 border border-white/10 text-white focus:outline-none focus:border-violet-500"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase text-white/40 mb-1">
                                    Global Meta Description (Max 160 chars)
                                </label>
                                <textarea
                                    rows={3}
                                    value={metaDesc}
                                    onChange={(e) => setMetaDesc(e.target.value)}
                                    className="w-full px-3 py-2.5 rounded-xl text-xs bg-white/5 border border-white/10 text-white focus:outline-none focus:border-violet-500"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase text-white/40 mb-1">
                                    OpenGraph Image CDN URL
                                </label>
                                <input
                                    type="text"
                                    value={ogImage}
                                    onChange={(e) => setOgImage(e.target.value)}
                                    className="w-full px-3 py-2.5 rounded-xl text-xs bg-white/5 border border-white/10 text-white focus:outline-none focus:border-violet-500 font-mono"
                                />
                            </div>
                        </div>
                    </div>
                    {/* Redirects List */}
                    <div className="p-6 rounded-3xl border border-white/5 bg-white/5 backdrop-blur-lg">
                        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-1.5">
                            <Globe className="w-4 h-4 text-violet-400" /> URL Redirect Rules
                        </h3>
                        <div className="space-y-3">
                            {redirects.length > 0 ? (
                                redirects.map((r) => (
                                    <div key={r.id} className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5 hover:border-violet-500/20 transition-all">
                                        <div className="flex items-center gap-4">
                                            <span className="text-[10px] font-black uppercase text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded font-mono">
                                                {r.code}
                                            </span>
                                            <div>
                                                <div className="flex items-center gap-1.5 text-xs text-white">
                                                    <span className="font-mono text-white/60">{r.source}</span>
                                                    <span className="text-violet-400">→</span>
                                                    <span className="font-mono text-white/90">{r.target}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteRedirect(r.id)}
                                            className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-all"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <div className="py-6 text-center text-xs text-white/40">No redirect rules set.</div>
                            )}
                        </div>
                    </div>
                </div>
                {/* Right Side: Add Redirect form */}
                <div className="p-6 rounded-3xl border border-white/5 bg-white/5 backdrop-blur-lg h-fit">
                    <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-1.5">
                        <PlusCircle className="w-4 h-4 text-violet-400" /> Add Redirect Route
                    </h3>
                    <form onSubmit={handleAddRedirect} className="space-y-4">
                        <div>
                            <label className="block text-[9px] font-black uppercase text-white/40 mb-1">
                                Source Path (Incoming URL)
                            </label>
                            <input
                                type="text"
                                required
                                placeholder="e.g. /tickets-pdf"
                                value={newSource}
                                onChange={(e) => setNewSource(e.target.value)}
                                className="w-full px-3 py-2.5 rounded-xl text-xs bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-violet-500 focus:outline-none transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-[9px] font-black uppercase text-white/40 mb-1">
                                Target Path (Destination URL)
                            </label>
                            <input
                                type="text"
                                required
                                placeholder="e.g. /register"
                                value={newTarget}
                                onChange={(e) => setNewTarget(e.target.value)}
                                className="w-full px-3 py-2.5 rounded-xl text-xs bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-violet-500 focus:outline-none transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-[9px] font-black uppercase text-white/40 mb-1">
                                Redirect Status Code
                            </label>
                            <select
                                value={newCode}
                                onChange={(e) => setNewCode(parseInt(e.target.value))}
                                className="w-full px-3 py-2.5 rounded-xl text-xs bg-zinc-800 border border-white/10 text-white focus:border-violet-500 focus:outline-none transition-colors"
                            >
                                <option value={301}>301 (Permanent Redirect)</option>
                                <option value={302}>302 (Temporary Redirect)</option>
                            </select>
                        </div>
                        <button
                            type="submit"
                            className="w-full flex items-center justify-center gap-1 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-xs font-black uppercase text-white shadow-lg transition-colors"
                        >
                            <Plus className="w-3.5 h-3.5" /> Create Redirect
                        </button>
                    </form>
                </div>
            </div>
        </PageContainer>
    );
}
