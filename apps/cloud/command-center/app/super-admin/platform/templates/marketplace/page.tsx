"use client";
import { useState, useMemo } from "react";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { KpiCard } from "@/components/super-admin/ui/KpiCard";
import {
    ShoppingBag,
    Star,
    Download,
    Search,
    ArrowLeft,
    Heart,
    Tag,
    MessageSquare,
    Sparkles,
    ShoppingBag as BagIcon,
    Compass,
    CheckCircle,
    Building
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
interface MarketplaceItem {
    id: string;
    name: string;
    category: string;
    developer: string;
    price: number;
    rating: number;
    reviewsCount: number;
    downloads: number;
    description: string;
    isFavorited: boolean;
    isPurchased: boolean;
}
export default function TemplateMarketplacePage() {
    const [search, setSearch] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("ALL");
    // Mock marketplace listings
    const [listings, setListings] = useState<MarketplaceItem[]>([
        {
            id: "m1",
            name: "Neo-Brutalism Hybrid Event Theme",
            category: "Websites",
            developer: "Stripe Designs",
            price: 49.00,
            rating: 4.9,
            reviewsCount: 38,
            downloads: 412,
            description: "High-contrast, bold brutalist layout with dynamic hover details and multi-track calendar layouts.",
            isFavorited: true,
            isPurchased: false
        },
        {
            id: "m2",
            name: "Cyberpunk Developer Conference Badge",
            category: "Badges",
            developer: "Neon Lab",
            price: 19.00,
            rating: 4.7,
            reviewsCount: 14,
            downloads: 185,
            description: "Edgy neon printable badges with auto-generated attendee QR code placeholder and track icons.",
            isFavorited: false,
            isPurchased: true
        },
        {
            id: "m3",
            name: "Formal Academic Certificate Layout",
            category: "Certificates",
            developer: "EduTrust Corp",
            price: 0.00, // FREE
            rating: 4.8,
            reviewsCount: 65,
            downloads: 850,
            description: "A traditional, elegant certificate template with copper border lines and signature fields.",
            isFavorited: true,
            isPurchased: false
        },
        {
            id: "m4",
            name: "Interactive Gamified Feedback Form",
            category: "Forms",
            developer: "Questify Inc",
            price: 29.00,
            rating: 4.6,
            reviewsCount: 8,
            downloads: 90,
            description: "Keep attendees engaged with interactive rating stars, emoji selections, and reward point counts.",
            isFavorited: false,
            isPurchased: false
        },
        {
            id: "m5",
            name: "Clean Slate Minimalist Landing",
            category: "Websites",
            developer: "Antigravity UI",
            price: 39.00,
            rating: 4.9,
            reviewsCount: 42,
            downloads: 299,
            description: "A clean, dark mode landing page with fluid canvas animations and pre-configured agenda sliders.",
            isFavorited: false,
            isPurchased: false
        }
    ]);
    const handleFavorite = (id: string) => {
        setListings(prev =>
            prev.map(item => {
                if (item.id === id) {
                    const nextVal = !item.isFavorited;
                    toast.success(nextVal ? "Added listing to your favorites." : "Removed listing from your favorites.");
                    return { ...item, isFavorited: nextVal };
                }
                return item;
            })
        );
    };
    const handlePurchase = (id: string) => {
        setListings(prev =>
            prev.map(item => {
                if (item.id === id) {
                    toast.success(`Purchase processed successfully for ${item.name}! Added to installed templates.`);
                    return { ...item, isPurchased: true, downloads: item.downloads + 1 };
                }
                return item;
            })
        );
    };
    const filteredListings = useMemo(() => {
        return listings.filter((item) => {
            const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase()) ||
                item.developer.toLowerCase().includes(search.toLowerCase()) ||
                item.description.toLowerCase().includes(search.toLowerCase());
            const matchesCat = selectedCategory === "ALL" || item.category === selectedCategory;
            return matchesSearch && matchesCat;
        });
    }, [listings, search, selectedCategory]);
    const kpis = useMemo(() => {
        return [
            { title: "Marketplace Listings", value: listings.length, desc: "Verified partner designs", icon: Compass, iconColor: "brand" as const },
            { title: "Your Purchases", value: listings.filter(l => l.isPurchased).length, desc: "Installed in tenant pool", icon: CheckCircle, iconColor: "success" as const },
            { title: "Favorited Templates", value: listings.filter(l => l.isFavorited).length, desc: "Saved to your list", icon: Heart, iconColor: "info" as const }
        ];
    }, [listings]);
    return (
        <PageContainer>
            <div className="mb-4">
                <Link
                    href="/super-admin/platform/templates"
                    className="inline-flex items-center gap-1 text-[11px] font-black uppercase text-violet-400 hover:text-white transition-colors"
                >
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to Console
                </Link>
            </div>
            <SectionHeader
                title="Template Marketplace"
                description="Expand your event console by purchasing custom landing themes, form builders, and badge models."
            />
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {kpis.map((kpi, idx) => (
                    <KpiCard key={idx} {...kpi} />
                ))}
            </div>
            {/* Search & Category Filter */}
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between p-4 rounded-2xl border border-white/5 bg-white/5 backdrop-blur-md mb-6">
                <div className="relative w-full sm:w-80">
                    <Search className="absolute left-3 top-3 w-4 h-4 text-white/40" />
                    <input
                        type="text"
                        placeholder="Search theme makers or designs..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-violet-500 focus:outline-none transition-colors"
                    />
                </div>
                <div className="flex gap-2 w-full sm:w-auto overflow-x-auto no-scrollbar">
                    {["ALL", "Websites", "Forms", "Badges", "Certificates"].map((cat) => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors shrink-0 ${selectedCategory === cat
                                    ? "bg-violet-600 text-white"
                                    : "bg-white/5 border border-white/10 text-white/70 hover:bg-white/10"
                                }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>
            {/* Marketplace Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredListings.map((item) => (
                    <div
                        key={item.id}
                        className="relative flex flex-col justify-between p-6 rounded-3xl border border-white/5 bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-lg hover:border-violet-500/20 hover:bg-white/10 transition-all duration-300 group shadow-lg"
                    >
                        <div>
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <span className="text-[9px] font-black uppercase tracking-wider text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded">
                                        {item.category}
                                    </span>
                                    <div className="flex items-center gap-1.5 mt-2">
                                        <span className="text-xs text-white/40 font-bold flex items-center gap-1">
                                            <Building className="w-3 h-3" /> By {item.developer}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleFavorite(item.id)}
                                    className={`p-2 rounded-xl border transition-colors ${item.isFavorited
                                            ? "bg-red-500/15 border-red-500/30 text-red-400"
                                            : "bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10"
                                        }`}
                                    title={item.isFavorited ? "Remove from Favorites" : "Add to Favorites"}
                                >
                                    <Heart className="w-3.5 h-3.5 fill-current" />
                                </button>
                            </div>
                            <h3 className="text-[15px] font-bold text-white mb-2 group-hover:text-violet-300 transition-colors">
                                {item.name}
                            </h3>
                            <p className="text-[12px] text-white/60 mb-5 leading-relaxed">
                                {item.description}
                            </p>
                        </div>
                        <div className="border-t border-white/5 pt-4 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div>
                                    <p className="text-[9px] font-black text-white/30 uppercase">Price</p>
                                    <p className="text-sm font-black text-white">
                                        {item.price === 0.00 ? "FREE" : `$${item.price.toFixed(2)}`}
                                    </p>
                                </div>
                                <div className="h-6 w-px bg-white/5" />
                                <div>
                                    <p className="text-[9px] font-black text-white/30 uppercase">Rating</p>
                                    <div className="flex items-center gap-1 text-xs font-bold text-amber-400">
                                        <Star className="w-3.5 h-3.5 fill-current" /> {item.rating} <span className="text-white/30 font-normal">({item.reviewsCount})</span>
                                    </div>
                                </div>
                            </div>
                            {item.isPurchased ? (
                                <span className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-black uppercase text-emerald-400 shadow-md">
                                    <CheckCircle className="w-3.5 h-3.5" /> Installed
                                </span>
                            ) : (
                                <button
                                    onClick={() => handlePurchase(item.id)}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-xs font-black uppercase text-white shadow-lg transition-all"
                                >
                                    <Download className="w-3.5 h-3.5" /> Install
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </PageContainer>
    );
}
