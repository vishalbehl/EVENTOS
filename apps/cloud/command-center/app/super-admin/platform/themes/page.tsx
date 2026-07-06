"use client";
import { useState } from "react";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { KpiCard } from "@/components/super-admin/ui/KpiCard";
import {
    Palette,
    Eye,
    Sliders,
    Maximize2,
    Sparkles,
    RefreshCw,
    Plus,
    Save,
    CheckCircle,
    FileCode,
    Brush,
    Code
} from "lucide-react";
import { toast } from "sonner";
interface DesignToken {
    id: string;
    name: string;
    type: string;
    value: string;
}
export default function ThemeCustomizerPage() {
    const [activeTheme, setActiveTheme] = useState("Vibrant Glassmorphism");
    // HSL Customization Sliders State
    const [hue, setHue] = useState(260); // Violet Default
    const [saturation, setSaturation] = useState(85);
    const [lightness, setLightness] = useState(60);
    const [borderRadius, setBorderRadius] = useState(16);
    const [glassOpacity, setGlassOpacity] = useState(40);
    const [tokens, setTokens] = useState<DesignToken[]>([
        { id: "t1", name: "--pri", type: "Color", value: "hsl(260, 85%, 60%)" },
        { id: "t2", name: "--sec", type: "Color", value: "hsl(310, 85%, 55%)" },
        { id: "t3", name: "--radius", type: "Measurement", value: "16px" },
        { id: "t4", name: "--glass-blur", type: "Measurement", value: "12px" },
    ]);
    const [newTokenName, setNewTokenName] = useState("");
    const [newTokenValue, setNewTokenValue] = useState("");
    const handleAddToken = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTokenName || !newTokenValue) {
            toast.error("Please fill in token name and value");
            return;
        }
        const token: DesignToken = {
            id: Math.random().toString(),
            name: newTokenName.startsWith("--") ? newTokenName : `--${newTokenName}`,
            type: "Color/Value",
            value: newTokenValue,
        };
        setTokens([...tokens, token]);
        toast.success(`Design token ${token.name} added.`);
        setNewTokenName("");
        setNewTokenValue("");
    };
    const handleSaveTheme = () => {
        toast.success("Theme settings and design tokens saved to db.");
    };
    return (
        <PageContainer>
            <SectionHeader
                title="Theme Customizer"
                description="Configure dynamic CSS variables, HSL color ranges, glass intensity, and token values to deploy across websites."
                actions={
                    <button
                        onClick={handleSaveTheme}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-xs font-black uppercase text-white shadow-lg transition-all"
                    >
                        <Save className="w-3.5 h-3.5" /> Save Theme
                    </button>
                }
            />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Real-Time Design Tokens / Sliders */}
                <div className="lg:col-span-2 space-y-6">
                    {/* HSL Sliders Card */}
                    <div className="p-6 rounded-3xl border border-white/5 bg-white/5 backdrop-blur-lg">
                        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-1.5">
                            <Sliders className="w-4 h-4 text-violet-400" /> Harmony Customizer
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between text-xs text-white/60 mb-1">
                                    <span>Primary Hue (HSL)</span>
                                    <span className="font-mono text-violet-400">{hue}°</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="360"
                                    value={hue}
                                    onChange={(e) => setHue(parseInt(e.target.value))}
                                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-violet-500"
                                />
                            </div>
                            <div>
                                <div className="flex justify-between text-xs text-white/60 mb-1">
                                    <span>Saturation</span>
                                    <span className="font-mono text-violet-400">{saturation}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={saturation}
                                    onChange={(e) => setSaturation(parseInt(e.target.value))}
                                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-violet-500"
                                />
                            </div>
                            <div>
                                <div className="flex justify-between text-xs text-white/60 mb-1">
                                    <span>Lightness</span>
                                    <span className="font-mono text-violet-400">{lightness}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={lightness}
                                    onChange={(e) => setLightness(parseInt(e.target.value))}
                                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-violet-500"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4 pt-2">
                                <div>
                                    <div className="flex justify-between text-xs text-white/60 mb-1">
                                        <span>Border Radius</span>
                                        <span className="font-mono text-violet-400">{borderRadius}px</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="40"
                                        value={borderRadius}
                                        onChange={(e) => setBorderRadius(parseInt(e.target.value))}
                                        className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-violet-500"
                                    />
                                </div>
                                <div>
                                    <div className="flex justify-between text-xs text-white/60 mb-1">
                                        <span>Glass Opacity</span>
                                        <span className="font-mono text-violet-400">{glassOpacity}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="10"
                                        max="90"
                                        value={glassOpacity}
                                        onChange={(e) => setGlassOpacity(parseInt(e.target.value))}
                                        className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-violet-500"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                    {/* Design Tokens list */}
                    <div className="p-6 rounded-3xl border border-white/5 bg-white/5 backdrop-blur-lg">
                        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-1.5">
                            <Code className="w-4 h-4 text-violet-400" /> CSS Variables / Tokens
                        </h3>
                        <div className="space-y-3 mb-6">
                            {tokens.map((tok) => (
                                <div key={tok.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-mono font-bold text-violet-400">{tok.name}</span>
                                        <span className="text-[9px] uppercase tracking-wider text-white/30">({tok.type})</span>
                                    </div>
                                    <span className="text-xs font-mono text-white/60 bg-zinc-800 px-2 py-0.5 rounded border border-white/10">{tok.value}</span>
                                </div>
                            ))}
                        </div>
                        <form onSubmit={handleAddToken} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                            <div>
                                <label className="block text-[9px] font-black uppercase text-white/40 mb-1">Token Name</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="--my-custom-color"
                                    value={newTokenName}
                                    onChange={(e) => setNewTokenName(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-white focus:outline-none focus:border-violet-500 transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-[9px] font-black uppercase text-white/40 mb-1">Value</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="#8b5cf6 / 12px"
                                    value={newTokenValue}
                                    onChange={(e) => setNewTokenValue(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-white focus:outline-none focus:border-violet-500 transition-colors"
                                />
                            </div>
                            <button
                                type="submit"
                                className="w-full flex items-center justify-center gap-1 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-black uppercase text-white border border-white/10 transition-colors"
                            >
                                <Plus className="w-3.5 h-3.5" /> Add Token
                            </button>
                        </form>
                    </div>
                </div>
                {/* Right Column: Live Mock Preview */}
                <div>
                    <div className="sticky top-6 p-6 rounded-3xl border border-white/5 bg-zinc-950 shadow-2xl relative overflow-hidden">
                        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-1.5">
                            <Eye className="w-4 h-4 text-violet-400" /> Real-time Live Preview
                        </h3>
                        {/* Simulated website component */}
                        <div
                            className="p-6 rounded-3xl border transition-all duration-300 flex flex-col justify-between h-72 shadow-2xl relative"
                            style={{
                                borderRadius: `${borderRadius}px`,
                                backgroundColor: `hsla(${hue}, ${saturation}%, ${lightness - 40}%, ${glassOpacity / 100})`,
                                borderColor: `hsla(${hue}, ${saturation}%, ${lightness}%, 0.25)`,
                                backdropFilter: `blur(${glassOpacity / 3}px)`
                            }}
                        >
                            {/* Top Details */}
                            <div>
                                <div className="flex justify-between items-center mb-4">
                                    <span
                                        className="text-[9px] font-black uppercase px-2 py-0.5 rounded"
                                        style={{
                                            backgroundColor: `hsla(${hue}, ${saturation}%, ${lightness}%, 0.2)`,
                                            color: `hsla(${hue}, ${saturation}%, ${lightness + 20}%, 1)`
                                        }}
                                    >
                                        Tech Session
                                    </span>
                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                                </div>
                                <h4 className="text-base font-bold text-white leading-snug">
                                    Antigravity Web App Theme Preview
                                </h4>
                                <p className="text-xs text-white/60 mt-1 leading-relaxed">
                                    Notice how card rounded borders and glass overlay colors change automatically as you adjust theme sliders on the left.
                                </p>
                            </div>
                            {/* Action Triggers */}
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-mono text-white/40">Glassmorphic Presets</span>
                                <button
                                    className="px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase text-white shadow-md transition-all"
                                    style={{
                                        backgroundColor: `hsla(${hue}, ${saturation}%, ${lightness - 10}%, 1)`
                                    }}
                                >
                                    Register Now
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </PageContainer>
    );
}
