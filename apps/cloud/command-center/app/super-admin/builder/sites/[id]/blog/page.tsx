"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import {
    ArrowLeft,
    FileText,
    Plus,
    Save,
    Trash2,
    Edit,
    Eye,
    Calendar,
    Layers,
    Settings,
    PenTool,
    CheckCircle,
    Clock
} from "lucide-react";
import { toast } from "sonner";
interface BlogPost {
    id: string;
    title: string;
    slug: string;
    content: string;
    status: string;
    publishedAt: string;
}
export default function BlogManagerPage() {
    const params = useParams();
    const router = useRouter();
    const siteId = params.id as string;
    const [posts, setPosts] = useState<BlogPost[]>([
        { id: "p1", title: "Announcing Our Speaker Keynote Panel", slug: "announcing-keynote-panel-2026", content: "We are thrilled to present our keynote speakers panel featuring industry experts discussing AI and SaaS developments...", status: "PUBLISHED", publishedAt: "2026-06-15" },
        { id: "p2", title: "Early Bird Registration Extended Until July 1st", slug: "early-bird-extended", content: "Due to high demand, we are extending early-bird registration discounts. Secure your tickets and save 25% on general admission...", status: "PUBLISHED", publishedAt: "2026-06-20" },
        { id: "p3", title: "Catering and Dietary Preferences Survey", slug: "dietary-preferences-survey", content: "To help us plan food offerings, please submit your dietary preferences and allergens survey inside the attendee portal...", status: "DRAFT", publishedAt: "—" },
    ]);
    const [activePost, setActivePost] = useState<BlogPost | null>(posts[0]);
    const [isEditing, setIsEditing] = useState(false);
    // Form State
    const [formTitle, setFormTitle] = useState("");
    const [formSlug, setFormSlug] = useState("");
    const [formContent, setFormContent] = useState("");
    const [formStatus, setFormStatus] = useState("DRAFT");
    const handleSelectPost = (p: BlogPost) => {
        setActivePost(p);
        setIsEditing(false);
    };
    const handleStartEdit = (p: BlogPost) => {
        setActivePost(p);
        setFormTitle(p.title);
        setFormSlug(p.slug);
        setFormContent(p.content);
        setFormStatus(p.status);
        setIsEditing(true);
    };
    const handleNewPost = () => {
        setFormTitle("");
        setFormSlug("");
        setFormContent("");
        setFormStatus("DRAFT");
        setActivePost(null);
        setIsEditing(true);
    };
    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formTitle) {
            toast.error("Please provide a title");
            return;
        }
        if (activePost) {
            // Editing existing
            const updated = posts.map(p => {
                if (p.id === activePost.id) {
                    const publishedDate = formStatus === "PUBLISHED" && p.publishedAt === "—"
                        ? new Date().toISOString().split("T")[0]
                        : p.publishedAt;
                    return {
                        ...p,
                        title: formTitle,
                        slug: formSlug || formTitle.toLowerCase().replace(/ /g, "-"),
                        content: formContent,
                        status: formStatus,
                        publishedAt: publishedDate
                    };
                }
                return p;
            });
            setPosts(updated);
            toast.success("Blog article updated successfully.");
            const edited = updated.find(p => p.id === activePost.id);
            if (edited) setActivePost(edited);
        } else {
            // Creating new
            const newPost: BlogPost = {
                id: Math.random().toString(),
                title: formTitle,
                slug: formSlug || formTitle.toLowerCase().replace(/ /g, "-"),
                content: formContent,
                status: formStatus,
                publishedAt: formStatus === "PUBLISHED" ? new Date().toISOString().split("T")[0] : "—"
            };
            setPosts([newPost, ...posts]);
            toast.success("New blog article posted successfully.");
            setActivePost(newPost);
        }
        setIsEditing(false);
    };
    const handleDelete = (id: string) => {
        const remaining = posts.filter(p => p.id !== id);
        setPosts(remaining);
        toast.success("Blog article deleted successfully.");
        if (activePost?.id === id) {
            setActivePost(remaining[0] || null);
        }
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
                title="CMS Blog Manager"
                description="Write and publish announcement posts, speaker features, schedule changes, and event updates."
                actions={
                    <button
                        onClick={handleNewPost}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-xs font-black uppercase text-white shadow-lg transition-all"
                    >
                        <Plus className="w-3.5 h-3.5" /> New Blog Post
                    </button>
                }
            />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-230px)] items-stretch">
                {/* Left column: Articles List */}
                <div className="p-5 rounded-3xl border border-white/5 bg-white/5 backdrop-blur-lg flex flex-col justify-between overflow-y-auto no-scrollbar">
                    <div className="space-y-3">
                        <h3 className="text-xs font-black uppercase text-white/40 mb-3 tracking-wider">Articles List</h3>
                        {posts.map((post) => (
                            <div
                                key={post.id}
                                onClick={() => handleSelectPost(post)}
                                className={`p-4 rounded-2xl border transition-all cursor-pointer ${activePost?.id === post.id && !isEditing
                                        ? "bg-violet-600/10 border-violet-500"
                                        : "bg-white/5 border-white/5 hover:border-white/10 hover:bg-white/10"
                                    }`}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${post.status === "PUBLISHED"
                                            ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                                            : "bg-amber-500/10 border border-amber-500/20 text-amber-400"
                                        }`}>
                                        {post.status}
                                    </span>
                                    <span className="text-[10px] text-white/40 font-mono flex items-center gap-1">
                                        <Calendar className="w-3 h-3" /> {post.publishedAt}
                                    </span>
                                </div>
                                <h4 className="text-xs font-bold text-white leading-snug">{post.title}</h4>
                            </div>
                        ))}
                    </div>
                </div>
                {/* Right column: Content Viewer / Editor */}
                <div className="lg:col-span-2 p-6 rounded-3xl border border-white/5 bg-white/5 backdrop-blur-lg overflow-y-auto no-scrollbar">
                    {isEditing ? (
                        <form onSubmit={handleSave} className="space-y-4">
                            <div className="flex justify-between items-center pb-4 border-b border-white/5 mb-4">
                                <h3 className="text-xs font-black uppercase text-white tracking-wider flex items-center gap-1.5">
                                    <PenTool className="w-4 h-4 text-violet-400" /> {activePost ? "Edit Article" : "Create Article"}
                                </h3>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setIsEditing(false)}
                                        className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-white transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-xs font-bold text-white transition-colors shadow-lg shadow-violet-600/30"
                                    >
                                        <Save className="w-3.5 h-3.5" /> Save Post
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase text-white/40 mb-1">Post Title *</label>
                                <input
                                    type="text"
                                    required
                                    value={formTitle}
                                    onChange={(e) => setFormTitle(e.target.value)}
                                    placeholder="e.g. Catering & Dietary Preferences Survey"
                                    className="w-full px-3 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-violet-500 focus:outline-none transition-colors"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-white/40 mb-1">URL Slug</label>
                                    <input
                                        type="text"
                                        value={formSlug}
                                        onChange={(e) => setFormSlug(e.target.value)}
                                        placeholder="dietary-preferences-survey"
                                        className="w-full px-3 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-violet-500 focus:outline-none transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-white/40 mb-1">Publishing Status</label>
                                    <select
                                        value={formStatus}
                                        onChange={(e) => setFormStatus(e.target.value)}
                                        className="w-full px-3 py-2 rounded-xl text-xs bg-zinc-800 border border-white/10 text-white focus:border-violet-500 focus:outline-none transition-colors"
                                    >
                                        <option value="DRAFT">Draft</option>
                                        <option value="PUBLISHED">Published</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase text-white/40 mb-1">Content Body (Markdown/HTML)</label>
                                <textarea
                                    rows={8}
                                    required
                                    value={formContent}
                                    onChange={(e) => setFormContent(e.target.value)}
                                    placeholder="Write the full post contents here..."
                                    className="w-full px-3 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-violet-500 focus:outline-none transition-colors font-sans leading-relaxed"
                                />
                            </div>
                        </form>
                    ) : activePost ? (
                        <div>
                            <div className="flex justify-between items-center pb-4 border-b border-white/5 mb-6">
                                <div>
                                    <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${activePost.status === "PUBLISHED"
                                            ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                                            : "bg-amber-500/10 border border-amber-500/20 text-amber-400"
                                        }`}>
                                        {activePost.status}
                                    </span>
                                    <span className="text-xs text-white/40 font-mono ml-3">Published: {activePost.publishedAt}</span>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleStartEdit(activePost)}
                                        className="flex items-center gap-1 px-3.5 py-1.5 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 text-xs font-bold text-white transition-colors"
                                    >
                                        <Edit className="w-3.5 h-3.5" /> Edit
                                    </button>
                                    <button
                                        onClick={() => handleDelete(activePost.id)}
                                        className="p-1.5 rounded-xl border border-red-500/10 bg-red-500/5 hover:bg-red-500/15 text-red-400 transition-colors"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                            <h2 className="text-base font-black text-white leading-tight mb-2">{activePost.title}</h2>
                            <p className="text-[11.5px] text-white/30 font-mono mb-6">URL Slug: /{activePost.slug}</p>
                            <div className="text-xs text-white/70 font-sans leading-relaxed whitespace-pre-wrap">
                                {activePost.content}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center text-white/40 py-12">
                            <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                            <p className="text-xs font-bold">No Article Created</p>
                            <p className="text-[10px]">Create an article to start publishing announcements on the landing page.</p>
                        </div>
                    )}
                </div>
            </div>
        </PageContainer>
    );
}
