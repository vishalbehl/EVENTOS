"use client";

import { FileText, Search, Book, Video, MessageCircle, ArrowRight, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function GlobalDocumentationPage() {
  const sections = [
    {
      title: "Getting Started",
      description: "Learn the basics of setting up your event and importing data.",
      icon: Book,
      link: "#",
    },
    {
      title: "Speaker Management",
      description: "How to invite speakers, track uploads, and manage profiles.",
      icon: FileText,
      link: "#",
    },
    {
      title: "Video Tutorials",
      description: "Step-by-step video guides for complex platform features.",
      icon: Video,
      link: "#",
    },
    {
      title: "Support Desk",
      description: "Connect with our technical team for immediate assistance.",
      icon: MessageCircle,
      link: "#",
    },
  ];

  return (
    <div className="space-y-10 animate-fade-in pb-20">
      <header className="px-2">
        <h1 className="text-3xl font-black tracking-tighter text-[var(--text)] mb-2 text-glow-indigo">
          Platform <span className="text-[var(--pri)]">Knowledge Base</span>
        </h1>
        <p className="text-[13px] font-bold text-muted uppercase tracking-[0.3em]">Master the event ecosystem</p>
      </header>

      <section className="relative group max-w-2xl mx-auto py-10">
        <div className="absolute inset-0 bg-[var(--pri)]/5 blur-3xl opacity-50 group-hover:opacity-100 transition-opacity" />
        <div className="relative neomorphic-inset rounded-3xl p-1 border border-default focus-within:border-[var(--pri)]/50 transition-all">
          <Search className="absolute left-6 top-5 h-5 w-5 text-muted" />
          <Input
            placeholder="Search documentation, guides, and tutorials..."
            className="h-14 bg-transparent border-0 pl-16 text-[15px] font-bold text-[var(--text)] placeholder:text-muted focus-visible:ring-0"
          />
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {sections.map((s, i) => (
          <Card key={i} className="glass-3d border-default rounded-[2.5rem] p-8 group hover:bg-[var(--pri)]/5 transition-all cursor-pointer">
            <div className="flex items-start justify-between mb-8">
              <div className="h-14 w-14 rounded-2xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-default flex items-center justify-center group-hover:bg-[var(--pri)]/10 group-hover:border-[var(--pri)]/30 transition-all">
                <s.icon className="h-7 w-7 text-[var(--pri)]" />
              </div>
              <ExternalLink className="h-5 w-5 text-muted opacity-0 group-hover:opacity-100 transition-all" />
            </div>
            <h3 className="text-xl font-black text-[var(--text)] mb-2 tracking-tight">{s.title}</h3>
            <p className="text-[14px] font-bold text-muted leading-relaxed mb-6">{s.description}</p>
            <Button variant="ghost" className="p-0 text-[11px] font-black uppercase tracking-[0.2em] text-[var(--pri)] hover:bg-transparent flex items-center gap-2">
              Explore Guide <ArrowRight className="h-4 w-4" />
            </Button>
          </Card>
        ))}
      </div>

      <Card className="glass-3d border-[var(--pri)]/20 rounded-[2.5rem] p-10 mt-12 overflow-hidden relative">
        <div className="absolute top-0 right-0 h-full w-1/2 bg-gradient-to-l from-[var(--pri)]/10 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div>
            <h2 className="text-2xl font-black text-[var(--text)] tracking-tight mb-2">Need Custom Assistance?</h2>
            <p className="text-[14px] font-bold text-muted">Our dedicated account managers are ready to help you with enterprise-level requirements.</p>
          </div>
          <Button className="h-14 px-10 bg-[var(--text)] text-[var(--base)] font-black uppercase tracking-widest text-[12px] rounded-full hover:scale-105 transition-all">Contact Expert</Button>
        </div>
      </Card>
    </div>
  );
}
