"use client";

import { usePortalAuth } from "@/hooks/usePortal";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { 
  Calendar, Clock, MapPin, FileUp, CheckCircle2, 
  AlertCircle, ChevronRight, Presentation, LogOut,
  FileVideo, Info, History, ArrowRight, Zap, ShieldCheck,
  Monitor, FileText, Lock, QrCode, Download, FileImage
} from "lucide-react";
import Link from "next/link";
import { PortalHeader } from "@/components/PortalHeader";
import { DeadlineBanner, DeadlineCountdownBadge } from "@/components/DeadlineBanner";
import { cn } from "@/lib/utils";
import { useDeadlineStatus } from "@/hooks/useDeadlineStatus";

export default function SpeakerLandingPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const { data: portal, isLoading, error } = usePortalAuth(token);

  // Always compute deadline status (hook cannot be called conditionally)
  const deadlineInfo = useDeadlineStatus(
    portal?.upload_deadline ?? null,
    portal?.allow_override ?? false
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
          <div className="text-xs font-black text-muted uppercase tracking-[0.3em]">Authenticating</div>
        </div>
      </div>
    );
  }

  if (error || !portal) {
    let errorMessage = "The security token or access code you provided is invalid or has expired.";
    if (error) {
      const axiosError = error as any;
      if (axiosError.response?.data?.detail) {
        errorMessage = axiosError.response.data.detail;
      }
    }

    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6">
        <motion.div 
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="glass-3d p-10 max-w-md text-center"
        >
          <div className="h-20 w-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="h-10 w-10 text-red-400" />
          </div>
          <h1 className="text-2xl font-black mb-4 text-red-400 uppercase tracking-tighter">Access Denied</h1>
          <p className="text-muted font-bold text-sm mb-8 leading-relaxed">
            {errorMessage}
          </p>
          <button 
            onClick={() => router.push('/')}
            className="btn-primary w-full h-12"
          >
            Go Back
          </button>
        </motion.div>
      </div>
    );
  }

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const item = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1 }
  };

  const speakerName = `${portal.first_name} ${portal.last_name}`;
  const isDeadlineLocked = deadlineInfo.isLocked;

  return (
    <div className="min-h-screen flex flex-col">
      {portal.theme_color && (
        <style dangerouslySetInnerHTML={{ __html: `
          :root {
            --pri: ${portal.theme_color};
            --sec: color-mix(in srgb, ${portal.theme_color} 80%, white);
          }
        `}} />
      )}
      {/* Sticky deadline banner — mounts above header */}
      <DeadlineBanner deadlineInfo={deadlineInfo} className="sticky top-0 z-[60]" />

      <PortalHeader speakerName={speakerName} token={token} />
           <main className="flex-1 max-w-7xl mx-auto w-full px-6 md:px-10 py-12 space-y-12">
        {/* Welcome Section */}
        <motion.section 
          variants={item}
          initial="hidden"
          animate="show"
          className="flex flex-col md:flex-row items-center justify-between gap-8"
        >
          <div className="flex items-center gap-6">
             <div className="h-20 w-20 glass-3d rounded-[2rem] flex flex-col items-center justify-center border-indigo-500/30 shadow-2xl transform -rotate-3 hover:rotate-0 transition-transform bg-indigo-500/5">
                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Speaker</span>
                <span className="text-3xl font-black text-[#E8EAFF]">{portal.first_name[0]}</span>
             </div>
             <div>
                <div className="flex items-center gap-3 mb-2">
                   <h1 className="text-4xl font-black tracking-tighter text-[#E8EAFF] text-glow-indigo">
                     Welcome, <span className="text-indigo-400">{portal.first_name}</span>
                   </h1>
                </div>
                <p className="text-[11px] font-bold text-muted uppercase tracking-[0.3em]">
                   Presenter Hub • {portal.event_name}
                </p>
             </div>
          </div>

          <div className="flex items-center gap-6">
             <div className="text-right hidden xl:block">
                <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-1">Submission Progress</p>
                <div className="flex items-center gap-3">
                    <span className="text-2xl font-black text-[#E8EAFF]">
                      {Math.round(
                        ((portal.talks.filter(t => t.upload_status !== 'pending').length + 
                          portal.posters.filter(p => p.status !== 'pending').length) / 
                         ((portal.talks.length + portal.posters.length) || 1)) * 100
                      )}%
                    </span>
                    <div className="h-1.5 w-32 bg-white/5 rounded-full overflow-hidden border border-white/5">
                       <div 
                          className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-1000" 
                          style={{ 
                            width: `${Math.round(
                              ((portal.talks.filter(t => t.upload_status !== 'pending').length + 
                                portal.posters.filter(p => p.status !== 'pending').length) / 
                               ((portal.talks.length + portal.posters.length) || 1)) * 100
                            )}%` 
                          }} 
                       />
                    </div>
                </div>
             </div>
          </div>
        </motion.section>

        {/* Two-Column Responsive Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 items-start">
          
          {/* Left Columns (Upload lists) */}
          <div className="lg:col-span-2 space-y-12">
            
            {/* Presentations List */}
            <motion.section 
              variants={container}
              initial="hidden"
              animate="show"
              className="space-y-6"
            >
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <h2 className="text-[12px] font-black text-muted uppercase tracking-[0.3em] flex items-center gap-3">
                  <Presentation className="h-4 w-4 text-indigo-400" /> Required Uploads
                </h2>
                <DeadlineCountdownBadge deadlineInfo={deadlineInfo} />
              </div>

              {portal.talks.length === 0 ? (
                <motion.div variants={item} className="glass-3d p-20 text-center text-muted font-black uppercase tracking-widest italic rounded-[2.5rem]">
                  No active presentation assignments found
                </motion.div>
              ) : (
                <div className="grid gap-6">
                  {portal.talks.map((talk) => (
                    <motion.div 
                      key={talk.session_speaker_id}
                      variants={item}
                      className="glass-3d p-8 group hover-lift-3d flex flex-col lg:flex-row lg:items-center justify-between gap-8 rounded-[2.5rem]"
                    >
                      <div className="flex-1 space-y-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className={cn(
                            "badge",
                            talk.upload_status === 'approved' ? 'badge-success' :
                            talk.upload_status === 'uploaded' ? 'badge-info' :
                            'badge-warning'
                          )}>
                            {talk.upload_status}
                          </span>
                          <span className="text-[10px] font-black text-muted uppercase tracking-widest px-2 py-1 rounded bg-white/5 border border-white/5">
                            {talk.session_code}
                          </span>
                          {deadlineInfo.status === "override" && (
                            <span className="text-[10px] font-black text-yellow-400 uppercase tracking-widest px-2 py-1 rounded bg-yellow-500/10 border border-yellow-500/20">
                              Late submission — approval required
                            </span>
                          )}
                        </div>
                        
                        <h3 className="text-2xl md:text-3xl font-black tracking-tighter group-hover:text-indigo-400 transition-colors">
                          {talk.talk_title || talk.session_name}
                        </h3>
                        
                        <div className="flex flex-wrap gap-x-8 gap-y-3">
                          <div className="flex items-center gap-2.5 text-sm font-bold text-muted">
                            <Calendar className="h-4 w-4 text-indigo-400/70" />
                            {new Date(talk.start_time).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}
                          </div>
                          <div className="flex items-center gap-2.5 text-sm font-bold text-muted">
                            <Clock className="h-4 w-4 text-indigo-400/70" />
                            {new Date(talk.start_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })} IST
                          </div>
                          {talk.room_name && (
                            <div className="flex items-center gap-2.5 text-sm font-bold text-muted">
                              <MapPin className="h-4 w-4 text-indigo-400/70" />
                              {talk.room_name}
                            </div>
                          )}
                        </div>

                        {talk.rejection_reason && (
                          <div className="p-4 rounded-2xl bg-red-500/5 border border-red-500/10 text-red-400 text-[11px] font-bold">
                            Reason for rejection: {talk.rejection_reason}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-6">
                        {isDeadlineLocked ? (
                          <div className="flex flex-col items-center gap-3 text-center px-6">
                            <div className="h-14 w-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                              <Lock className="h-6 w-6 text-red-400" />
                            </div>
                            <p className="text-[10px] font-black text-red-400 uppercase tracking-widest max-w-[160px] leading-relaxed">
                              Deadline passed
                            </p>
                          </div>
                        ) : (
                          <Link 
                            href={`/${token}/upload?slot=${talk.session_speaker_id}`}
                            className={cn(
                              "px-10 h-14 w-full sm:w-auto flex items-center justify-center gap-3 rounded-full font-black text-[11px] uppercase tracking-widest transition-all",
                              deadlineInfo.status === "override"
                                ? "bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/30"
                                : "btn-primary"
                            )}
                          >
                            {talk.upload_status === 'pending' ? (
                              <>Begin Upload <FileUp className="h-4 w-4" /></>
                            ) : (
                              <>Update Files <ChevronRight className="h-4 w-4" /></>
                            )}
                          </Link>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.section>

            {/* Posters List */}
            {portal.posters && portal.posters.length > 0 && (
              <motion.section 
                variants={container}
                initial="hidden"
                animate="show"
                className="space-y-6"
              >
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <h2 className="text-[12px] font-black text-muted uppercase tracking-[0.3em] flex items-center gap-3">
                    <Monitor className="h-4 w-4 text-indigo-400" /> Digital Posters
                  </h2>
                </div>

                <div className="grid gap-6">
                  {portal.posters.map((poster) => (
                    <motion.div 
                      key={poster.id}
                      variants={item}
                      className="glass-3d p-8 group hover-lift-3d flex flex-col lg:flex-row lg:items-center justify-between gap-8 rounded-[2.5rem]"
                    >
                      <div className="flex-1 space-y-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className={cn(
                            "badge",
                            poster.status === 'approved' ? 'badge-success' :
                            poster.status === 'submitted' ? 'badge-info' :
                            poster.status === 'rejected' ? 'badge-error' :
                            'badge-warning'
                          )}>
                            {poster.status}
                          </span>
                          <span className="text-[10px] font-black text-muted uppercase tracking-widest px-2 py-1 rounded bg-white/5 border border-white/5">
                            E-POSTER
                          </span>
                          {deadlineInfo.status === "override" && (
                            <span className="text-[10px] font-black text-yellow-400 uppercase tracking-widest px-2 py-1 rounded bg-yellow-500/10 border border-yellow-500/20">
                              Late submission — approval required
                            </span>
                          )}
                        </div>
                        
                        <h3 className="text-2xl md:text-3xl font-black tracking-tighter group-hover:text-indigo-400 transition-colors">
                          {poster.title}
                        </h3>
                        
                        <div className="flex flex-wrap gap-x-8 gap-y-3">
                          <div className="flex items-center gap-2.5 text-sm font-bold text-muted">
                            <FileText className="h-4 w-4 text-indigo-400/70" />
                            {poster.category || "General Category"}
                          </div>
                          {poster.authors && (
                            <div className="text-sm font-bold text-muted/60">
                              {poster.authors}
                            </div>
                          )}
                        </div>

                        {poster.rejection_reason && (
                          <div className="p-4 rounded-2xl bg-red-500/5 border border-red-500/10 text-red-400 text-[11px] font-bold">
                            Reason for rejection: {poster.rejection_reason}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-6">
                        {isDeadlineLocked ? (
                          <div className="flex flex-col items-center gap-3 text-center px-6">
                            <div className="h-14 w-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                              <Lock className="h-6 w-6 text-red-400" />
                            </div>
                            <p className="text-[10px] font-black text-red-400 uppercase tracking-widest max-w-[160px] leading-relaxed">
                              Deadline passed
                            </p>
                          </div>
                        ) : (
                          <Link 
                            href={`/${token}/upload?poster=${poster.id}`}
                            className={cn(
                              "px-10 h-14 w-full sm:w-auto flex items-center justify-center gap-3 rounded-full font-black text-[11px] uppercase tracking-widest transition-all",
                              deadlineInfo.status === "override"
                                ? "bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/30"
                                : "btn-primary"
                            )}
                          >
                            {poster.status === 'pending' ? (
                              <>Upload PDF <FileUp className="h-4 w-4" /></>
                            ) : (
                              <>Update File <ChevronRight className="h-4 w-4" /></>
                            )}
                          </Link>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.section>
            )}
          </div>

          {/* Right Column - Premium Event Access Pass */}
          <motion.section 
            variants={item}
            initial="hidden"
            animate="show"
            className="space-y-6 lg:sticky lg:top-24"
          >
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <h2 className="text-[12px] font-black text-muted uppercase tracking-[0.3em] flex items-center gap-3">
                <QrCode className="h-4 w-4 text-indigo-400" /> Event Access Pass
              </h2>
            </div>

            <div className="glass-3d p-8 rounded-[2.5rem] bg-indigo-950/10 border-indigo-500/10 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-indigo-500/20 transition-all duration-700" />
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl pointer-events-none" />

              <div className="text-center space-y-6">
                <div>
                  <span className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.3em] block mb-1">
                    Your Digital Badge
                  </span>
                  <h3 className="text-xl font-black tracking-tight text-[#E8EAFF]">
                    Event Entry Pass
                  </h3>
                </div>

                {/* Branded QR Card Image */}
                <div className="relative mx-auto max-w-[240px] aspect-[2/3] rounded-[1.5rem] overflow-hidden border border-white/15 bg-white shadow-2xl transition-transform duration-500 hover:scale-[1.03] group-hover:border-indigo-500/30">
                  <img 
                    src={`${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'}/api/v1/portal/speaker-qr/${portal.speaker_id}/download?format=jpg`} 
                    alt="Speaker Badge Pass QR"
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent pointer-events-none" />
                </div>

                <div className="space-y-4">
                  <div className="inline-flex flex-col items-center px-4 py-2 rounded-xl bg-white/5 border border-white/5">
                    <span className="text-[8px] font-black text-muted uppercase tracking-widest">
                      Access Code
                    </span>
                    <span className="text-lg font-black text-indigo-400 uppercase tracking-wider">
                      {portal.speaker_code || 'N/A'}
                    </span>
                  </div>

                  <p className="text-[10px] font-bold text-muted leading-relaxed max-w-[200px] mx-auto">
                    Show this QR code at the event check-in kiosk or Speaker Ready Room (SRR).
                  </p>
                </div>

                {/* Download Actions */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <a 
                    href={`${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'}/api/v1/portal/speaker-qr/${portal.speaker_id}/download?format=jpg`}
                    download
                    className="flex items-center justify-center gap-2 h-12 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-black uppercase tracking-wider text-[#E8EAFF] transition-all hover:scale-[1.02] active:scale-95 cursor-pointer animate-pulse-subtle"
                  >
                    <FileImage className="h-4 w-4 text-indigo-400" /> JPG
                  </a>
                  <a 
                    href={`${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'}/api/v1/portal/speaker-qr/${portal.speaker_id}/download?format=pdf`}
                    download
                    className="flex items-center justify-center gap-2 h-12 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-black uppercase tracking-wider text-[#E8EAFF] transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
                  >
                    <FileText className="h-4 w-4 text-emerald-400" /> PDF
                  </a>
                </div>
              </div>
            </div>
          </motion.section>
        </div>
      </main>

      <footer className="mt-auto py-12 px-10 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="text-[10px] font-black text-muted uppercase tracking-[0.4em] opacity-40">
          © 2026 EventOS Platform Intelligence
        </div>
        <div className="flex items-center gap-8 text-[10px] font-black text-muted uppercase tracking-widest">
          <a href="#" className="hover:text-indigo-400 transition-colors">Support Hub</a>
          <a href="#" className="hover:text-indigo-400 transition-colors">Security Specs</a>
        </div>
      </footer>
    </div>
  );
}
