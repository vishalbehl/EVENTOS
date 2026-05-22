"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Shield, ArrowRight, Command } from "lucide-react";
import { toast } from "sonner";

export default function SpeakerPortalHome() {
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < 4) {
      toast.error("Please enter a valid speaker code.");
      return;
    }
    
    setIsSubmitting(true);
    // Simulate a bit of "loading" for premium feel
    setTimeout(() => {
      router.push(`/${code.toUpperCase()}`);
    }, 800);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 relative">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-3d p-12 max-w-md w-full relative group overflow-hidden"
      >
        {/* Animated Accent Line */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-50" />
        
        <header className="mb-10 text-center relative z-10">
          <div className="flex justify-center mb-6">
            <div className="h-16 w-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform duration-500">
              <Command className="h-8 w-8 text-indigo-400" />
            </div>
          </div>
          <h1 className="text-4xl font-black tracking-tighter text-glow-indigo mb-2">
            Speaker <span className="text-indigo-400">Portal</span>
          </h1>
          <p className="text-muted text-sm font-bold uppercase tracking-[0.2em]">Secure Access Hub</p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Unique Access Code</label>
            <div className="relative group">
              <input
                type="text"
                placeholder="A1B2C3D4"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="input text-center text-2xl tracking-[0.3em] uppercase font-mono h-16"
                maxLength={20}
                autoFocus
              />
              <Shield className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted/30 group-focus-within:text-indigo-400 transition-colors" />
            </div>
          </div>
          
          <button 
            type="submit" 
            disabled={isSubmitting}
            className="btn-primary w-full h-14 text-sm flex items-center justify-center gap-3"
          >
            {isSubmitting ? "Verifying..." : (
              <>
                Access Dashboard <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        <footer className="mt-12 pt-8 border-t border-white/5 text-center">
          <p className="text-xs font-medium text-muted leading-relaxed">
            Can't find your code? Access details were sent to your registered email address.
          </p>
        </footer>
      </motion.div>

      <div className="mt-8 text-[10px] font-black text-muted uppercase tracking-[0.4em] opacity-30">
        Powered by EventOS Platform
      </div>
    </div>
  );
}
