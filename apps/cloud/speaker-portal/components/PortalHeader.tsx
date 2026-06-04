"use client";
 
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  LogOut, User, Box, ShieldCheck, 
  ChevronRight, HelpCircle, Bell
} from "lucide-react";
import { cn } from "@/lib/utils";
 
export function PortalHeader({ speakerName, email = "", token, eventId, logoUrl }: { speakerName: string, email?: string, token: string, eventId: string, logoUrl?: string | null }) {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
 
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
 
  const initials = speakerName ? speakerName.split(' ').map(n => n[0]).join('') : 'SP';
 
  return (
    <header className="sticky top-0 z-50 w-full h-[100px] flex items-center px-6 md:px-10 gap-10 glass-3d border-t-0 border-x-0 rounded-none bg-[var(--base)]/40 backdrop-blur-xl">
      {/* Logo Section */}
      <div className="flex items-center gap-4 flex-1">
        <Link href={`/${eventId}/${token}`} className="flex items-center gap-4 group">
          <div className="relative h-10 w-10 shrink-0">
            <div className="absolute inset-0 bg-indigo-500/20 blur-md rounded-xl" />
            <div className="relative h-10 w-10 glass-3d border-indigo-500/30 rounded-xl flex items-center justify-center shadow-lg transform rotate-3 group-hover:rotate-0 transition-transform overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-full w-full object-contain p-1" />
              ) : (
                <Box className="h-5 w-5 text-indigo-400" />
              )}
            </div>
          </div>
          <div className="hidden sm:block">
            <h1 className="text-[18px] font-black tracking-tight text-[#E8EAFF] leading-none">
              Event<span className="text-indigo-400">OS</span>
            </h1>
            <p className="text-[8px] font-black uppercase tracking-[0.3em] text-indigo-400/60 mt-1">Speaker Portal</p>
          </div>
        </Link>
      </div>
 
      {/* Control Station */}
      <div className="flex items-center gap-4 md:gap-6 justify-end">
        {/* Support Link */}
        <Link href="#" className="hidden md:block">
          <button className="h-11 w-11 rounded-xl glass-3d border-white/5 flex items-center justify-center text-muted hover:text-indigo-400 hover:border-indigo-500/30 transition-all">
            <HelpCircle className="h-5 w-5" />
          </button>
        </Link>
 
        {/* User Menu */}
        <div className="flex items-center gap-4 pl-6 border-l border-white/10 relative" ref={userMenuRef}>
          <div className="hidden md:flex flex-col items-end mr-2">
            <p className="text-[12px] font-black text-[#E8EAFF] leading-none mb-1">{speakerName}</p>
            <p className="text-[9px] font-bold text-muted/60">{email || "Presenter"}</p>
          </div>
          
          <div
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="h-11 w-11 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center text-[13px] font-black text-[#E8EAFF] shadow-lg cursor-pointer hover:scale-105 transition-transform"
          >
            {initials}
          </div>
  
          <AnimatePresence>
            {isUserMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute right-0 top-full mt-3 w-64 glass-3d border-white/10 rounded-[1.5rem] p-4 z-50 shadow-2xl bg-[#171B38]/90"
              >
                <div className="px-2 py-3 border-b border-white/5 mb-2">
                  <p className="text-[14px] font-black text-[#E8EAFF]">{speakerName}</p>
                  <p className="text-[10px] font-bold text-muted/60 truncate mt-1">{email}</p>
                </div>
                <div className="space-y-1">
                  <button 
                    onClick={() => { router.push(`/${eventId}/${token}`); setIsUserMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-all text-[12px] font-bold text-muted hover:text-[#E8EAFF]"
                  >
                    <User className="h-4 w-4" /> Speaker Details
                  </button>
                  <div className="h-px bg-white/5 my-2" />
                  <button 
                    onClick={() => router.push(`/${eventId}/login`)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-red-500/10 transition-all text-[12px] font-bold text-red-400"
                  >
                    <LogOut className="h-4 w-4" /> Sign Out
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
