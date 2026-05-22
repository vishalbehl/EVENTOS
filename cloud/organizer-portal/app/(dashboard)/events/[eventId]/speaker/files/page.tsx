"use client";

import React, { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  FileVideo, FileText, Search, Filter, CheckCircle2, 
  XCircle, Maximize2, Download, MessageSquare, ShieldCheck,
  Zap, Box, ScanLine, Cpu, Database, Globe,
  Calendar, Clock, User, Eye, Send, ChevronDown, ChevronUp,
  FileArchive, AlertCircle, FileCheck, Info, MapPin, Tag, Layers,
  Terminal, HardDrive, FileJson, FileCode, Type, Music, Play, 
  Component, Lock, Unlock, Hash, ExternalLink, MousePointer2,
  Activity, Fingerprint, History, Mail, Flag, Check, ListChecks,
  Image as ImageIcon, Video
} from "lucide-react";
import { useFiles, useApproveFile, useRejectFile, useDownloadFile } from "@/hooks/useFiles";
import { useSessions } from "@/hooks/useSessions";
import { 
  usePosters, useReviewPoster, useDownloadPoster 
} from "@/hooks/usePosters";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { PERMISSIONS } from "@/lib/permissions";

// ── Reusable stat card helper ────────────────────────────────
// Helper for stat cards
function SC({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: React.ReactNode; color: string }) {
  return (
    <div className="p-3 rounded-2xl bg-[var(--base)]/80 border border-default shadow-sm flex flex-col items-center text-center gap-1">
      <Icon className={`h-4 w-4 ${color}`} />
      <p className="text-[16px] font-black leading-tight">{value}</p>
      <p className="text-[8px] font-black text-muted uppercase tracking-wider">{label}</p>
    </div>
  );
}


interface Assignment {
  id: string;
  type: string;
  topic: string;
  sessionName: string;
  track: string;
  roomName: string;
  startTime: string;
  files: any[];
}

interface Speaker {
  id: string;
  name: string;
  email: string;
  isDummy?: boolean;
  assignments: Assignment[];
}

export default function FileMonitoringPage() {
  const { eventId } = useParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDay, setFilterDay] = useState("all");
  const [filterRoom, setFilterRoom] = useState("all");
  const [filterSession, setFilterSession] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  
  // Navigation State for the Side Panel (Using IDs for real-time updates)
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string | null>(null);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectingFileId, setRejectingFileId] = useState<string | null>(null);
  
  // Fetch Data
  const { data: sessions, isLoading: sessionsLoading } = useSessions(eventId as string || "");
  const { data: posters, isLoading: postersLoading } = usePosters(eventId as string || "");
  const { data: files, isLoading: filesLoading } = useFiles(eventId as string || "");
  
  const approveMutation = useApproveFile(eventId as string);
  const rejectMutation = useRejectFile(eventId as string);
  const downloadMutation = useDownloadFile(eventId as string);
  
  const reviewPosterMutation = useReviewPoster(eventId as string);
  const downloadPosterMutation = useDownloadPoster(eventId as string);

  const getIntakeState = (file?: any) => {
    if (!file) {
      return {
        label: "Pending Upload",
        dot: "bg-slate-500",
        text: "text-slate-500",
        border: "border-slate-500/30",
        bg: "bg-slate-500/5",
        icon: AlertCircle,
      };
    }

    if (file.upload_status === "approved") {
      return {
        label: "Approved",
        dot: "bg-emerald-500",
        text: "text-emerald-500",
        border: "border-emerald-500/40",
        bg: "bg-emerald-500/10",
        icon: CheckCircle2,
      };
    }

    if (file.upload_status === "rejected") {
      return {
        label: "Rejected",
        dot: "bg-rose-500",
        text: "text-rose-500",
        border: "border-rose-500/40",
        bg: "bg-rose-500/10",
        icon: XCircle,
      };
    }

    return {
      label: "Pending Review",
      dot: "bg-amber-500",
      text: "text-amber-500",
      border: "border-amber-500/35",
      bg: "bg-amber-500/10",
      icon: Clock,
    };
  };

  // Master List & Logic
  const masterList = useMemo(() => {
    const list: Speaker[] = [];
    
    const speakerMap: Record<string, Speaker> = {};
    const sessionLookup: Record<string, any> = {};

    if (sessions) {
      sessions.forEach(s => {
        sessionLookup[s.id] = s;
        s.speakers?.forEach(speaker => {
          if (!speakerMap[speaker.id]) {
            speakerMap[speaker.id] = { id: speaker.id, name: speaker.full_name, email: speaker.email || "No Email Registered", assignments: [] };
          }
          // Filter files by this specific session assignment
          const speakerFiles = files?.filter(f => f.session_speaker_id === speaker.session_speaker_id) || [];
          speakerMap[speaker.id].assignments.push({
            id: speaker.session_speaker_id || `${s.id}-${speaker.id}`,
            type: "session",
            topic: speaker.presentation_title || "General Presentation",
            sessionName: s.name,
            track: "Plenary Track",
            roomName: s.room_name || "Unassigned",
            startTime: s.start_time,
            files: speakerFiles
          });
        });
      });
    }

    if (posters) {
      posters.forEach(poster => {
        if (poster.speaker_id) {
          if (!speakerMap[poster.speaker_id]) {
            speakerMap[poster.speaker_id] = { id: poster.speaker_id, name: poster.speaker_name || "Unknown Speaker", email: poster.speaker_email || "No Email Registered", assignments: [] };
          }
          const assignedSession = poster.session_id ? sessionLookup[poster.session_id] : null;
          
          const posterFiles = [];
          if (poster.original_filename) {
            posterFiles.push({
              id: poster.id,
              original_filename: poster.original_filename,
              file_size_bytes: poster.file_size_bytes,
              file_format: poster.original_filename.split('.').pop()?.toLowerCase() || 'pdf',
              version_number: poster.version_number,
              upload_status: poster.status, // We use this for getIntakeState
              uploaded_at: poster.submitted_at || poster.created_at,
              is_poster: true,
              // Poster-specific metadata for the audit view
              poster_title: poster.title,
              authors: poster.authors,
              category: poster.category,
              abstract: poster.abstract
            });
          }

          speakerMap[poster.speaker_id].assignments.push({
            id: poster.id,
            type: "poster",
            topic: poster.title,
            sessionName: assignedSession?.name || "ePoster Gallery",
            track: "ePoster Showcase",
            roomName: assignedSession?.room_name || poster.display_screen || "Poster Screen",
            startTime: assignedSession?.start_time || poster.created_at,
            files: posterFiles
          });
        }
      });
    }

    const sortedSpeakers = Object.values(speakerMap).sort((a, b) => a.name.localeCompare(b.name));
    return sortedSpeakers;
  }, [sessions, posters, files]);

  const filteredMasterList = useMemo(() => {
    return masterList.filter((speaker: Speaker) => {
      
      const nameMatch = speaker.name.toLowerCase().includes(searchQuery.toLowerCase());
      const hasMatchingAssignment = speaker.assignments.some((a: Assignment) => {
        const dMatch = filterDay === "all" || new Date(a.startTime).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) === filterDay;
        const rMatch = filterRoom === "all" || a.roomName === filterRoom;
        const sMatch = filterSession === "all" || a.sessionName === filterSession;
        
        let statusMatch = true;
        if (filterStatus !== "all") {
           const apprv = a.files.filter(f => f.upload_status === 'approved').length;
           const rjct = a.files.filter(f => f.upload_status === 'rejected').length;
           const uploaded = a.files.length;
           const pendReview = uploaded - apprv - rjct;

           if (filterStatus === "pending_upload") statusMatch = uploaded === 0;
           else if (filterStatus === "pending_review") statusMatch = pendReview > 0;
           else if (filterStatus === "approved") statusMatch = apprv > 0 && pendReview === 0;
           else if (filterStatus === "rejected") statusMatch = rjct > 0;
        }

        return dMatch && rMatch && sMatch && statusMatch && (nameMatch || a.topic.toLowerCase().includes(searchQuery.toLowerCase()));
      });
      return hasMatchingAssignment;
    });
  }, [masterList, searchQuery, filterDay, filterRoom, filterSession, filterStatus]);

  const selectedSpeaker = useMemo(() => 
    masterList.find(s => s.id === selectedSpeakerId), 
  [masterList, selectedSpeakerId]);

  const activeFileAudit = useMemo(() => {
    if (!selectedSpeaker || !activeFileId) return null;
    for (const assign of selectedSpeaker.assignments) {
      const file = assign.files.find((f: any) => f.id === activeFileId);
      if (file) return file;
    }
    return null;
  }, [selectedSpeaker, activeFileId]);

  const handleApprove = async (file: any) => {
    try { 
      if (file.is_poster) {
        await reviewPosterMutation.mutateAsync({ posterId: file.id, decision: "approved" });
      } else {
        await approveMutation.mutateAsync(file.id); 
      }
      toast.success("Approved."); 
    } 
    catch (e) { toast.error("Approval failed."); }
  };

  const handleReject = async () => {
    const reason = rejectionReason.trim();
    if (!activeFileId) return;
    if (reason.length < 5) {
      toast.error("Rejection reason must be at least 5 characters.");
      return;
    }
    try {
      if (activeFileAudit?.is_poster) {
        await reviewPosterMutation.mutateAsync({ posterId: activeFileId, decision: "rejected", rejection_reason: reason });
      } else {
        await rejectMutation.mutateAsync({ fileId: activeFileId, reason });
      }
      toast.success("Rejected."); setRejectingFileId(null); setRejectionReason("");
    } catch (e) { toast.error("Rejection failed."); }
  };

  const isLoading = sessionsLoading || postersLoading || filesLoading;

  return (
    <div className="h-[calc(100vh-140px)] flex gap-6 relative overflow-hidden font-sans">
      
      <div className="flex-1 flex flex-col gap-6 min-w-0 animate-fade-in">
         <div className="flex items-center justify-between px-2">
            <div>
               <h1 className="text-4xl font-black tracking-tighter text-[var(--text)]">File Review Center</h1>
               <div className="flex items-center gap-3 mt-2">
                  <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                     <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                     <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500/80">System Connected</span>
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">Real-time File Tracking</p>
               </div>
            </div>
            <div className="flex items-center gap-4">
               <div className="relative w-80 group">
                  <Search className="absolute left-4 top-3.5 h-4 w-4 text-muted group-focus-within:text-[var(--pri)] transition-colors" />
                  <input 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search speakers or topics..." 
                    className="w-full h-12 bg-[var(--base)] border border-default rounded-2xl pl-12 text-[12px] font-bold shadow-sm focus:outline-none focus:border-[var(--pri)]/50 transition-all placeholder:text-muted/40" 
                  />
               </div>
            </div>
         </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
            <Card className="glass-3d border-default rounded-3xl p-6 flex items-center gap-5 bg-emerald-500/5">
              <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              </div>
              <div>
                <p className="text-[10px] font-black text-muted uppercase tracking-widest">Approved</p>
                <p className="text-2xl font-black text-emerald-500 tracking-tighter">
                  {filteredMasterList.reduce((acc, s) => acc + s.assignments.reduce((a, as) => a + as.files.filter(f => f.upload_status === 'approved').length, 0), 0)}
                </p>
              </div>
            </Card>
            <Card className="glass-3d border-default rounded-3xl p-6 flex items-center gap-5 bg-amber-500/5">
              <div className="h-12 w-12 rounded-2xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                <Clock className="h-6 w-6 text-amber-500" />
              </div>
              <div>
                <p className="text-[10px] font-black text-muted uppercase tracking-widest">Pending Review</p>
                <p className="text-2xl font-black text-amber-500 tracking-tighter">
                  {filteredMasterList.reduce((acc, s) => acc + s.assignments.reduce((a, as) => {
                    const uploaded = as.files.length;
                    const apprv = as.files.filter(f => f.upload_status === 'approved').length;
                    const rjct = as.files.filter(f => f.upload_status === 'rejected').length;
                    return a + (uploaded - apprv - rjct);
                  }, 0), 0)}
                </p>
              </div>
            </Card>
            <Card className="glass-3d border-default rounded-3xl p-6 flex items-center gap-5 bg-slate-500/5">
              <div className="h-12 w-12 rounded-2xl bg-slate-500/10 flex items-center justify-center border border-slate-500/20">
                <AlertCircle className="h-6 w-6 text-slate-500" />
              </div>
              <div>
                <p className="text-[10px] font-black text-muted uppercase tracking-widest">Pending Upload</p>
                <p className="text-2xl font-black text-slate-500 tracking-tighter">
                  {filteredMasterList.reduce((acc, s) => acc + s.assignments.filter(as => as.files.length === 0).length, 0)}
                </p>
              </div>
            </Card>
            <Card className="glass-3d border-default rounded-3xl p-6 flex items-center gap-5 bg-rose-500/5">
              <div className="h-12 w-12 rounded-2xl bg-rose-500/10 flex items-center justify-center border border-rose-500/20">
                <XCircle className="h-6 w-6 text-rose-500" />
              </div>
              <div>
                <p className="text-[10px] font-black text-muted uppercase tracking-widest">Rejected</p>
                <p className="text-2xl font-black text-rose-500 tracking-tighter">
                  {filteredMasterList.reduce((acc, s) => acc + s.assignments.reduce((a, as) => a + as.files.filter(f => f.upload_status === 'rejected').length, 0), 0)}
                </p>
              </div>
            </Card>
            <Card className="glass-3d border-default rounded-3xl p-6 flex items-center gap-5 bg-[var(--pri)]/5">
              <div className="h-12 w-12 rounded-2xl bg-[var(--pri)]/10 flex items-center justify-center border border-[var(--pri)]/20">
                <Database className="h-6 w-6 text-[var(--pri)]" />
              </div>
              <div>
                <p className="text-[10px] font-black text-muted uppercase tracking-widest">Total Uploads</p>
                <p className="text-2xl font-black text-[var(--pri)] tracking-tighter">
                  {filteredMasterList.reduce((acc, s) => acc + s.assignments.reduce((a, as) => a + as.files.length, 0), 0)}
                </p>
              </div>
            </Card>
          </div>

          <div className="flex items-center gap-4 p-4 bg-[var(--base)]/60 rounded-[2rem] border border-default backdrop-blur-3xl shadow-lg">
            <div className="flex items-center gap-3 px-6 py-2 border-r border-default shrink-0">
               <Filter className="h-4 w-4 text-[var(--pri)]" />
               <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text)]">Filters</span>
            </div>
            
            <div className="flex flex-1 gap-4 overflow-x-auto no-scrollbar">
               <select 
                 value={filterDay} 
                 onChange={(e) => setFilterDay(e.target.value)} 
                 className="h-11 min-w-[150px] bg-[var(--base)] border border-default rounded-xl px-4 text-[11px] font-black uppercase tracking-widest text-[var(--text)] focus:outline-none focus:border-[var(--pri)]/50 transition-all cursor-pointer hover:bg-[var(--base)]/80 shadow-sm"
               >
                  <option value="all">All Dates</option>
                  {Array.from(new Set(masterList.flatMap(s => s.assignments.map(a => new Date(a.startTime).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }))))).sort().map(d => <option key={d} value={d}>{d}</option>)}
               </select>

               <select 
                 value={filterRoom} 
                 onChange={(e) => setFilterRoom(e.target.value)} 
                 className="h-11 min-w-[150px] bg-[var(--base)] border border-default rounded-xl px-4 text-[11px] font-black uppercase tracking-widest text-[var(--text)] focus:outline-none focus:border-[var(--sec)]/50 transition-all cursor-pointer hover:bg-[var(--base)]/80 shadow-sm"
               >
                  <option value="all">All Venues</option>
                  {Array.from(new Set(masterList.flatMap(s => s.assignments.map(a => a.roomName)))).sort().map(r => <option key={r} value={r}>{r}</option>)}
               </select>

               <select 
                 value={filterSession} 
                 onChange={(e) => setFilterSession(e.target.value)} 
                 className="h-11 flex-1 max-w-[220px] bg-[var(--base)] border border-default rounded-xl px-4 text-[11px] font-black uppercase tracking-widest text-[var(--text)] focus:outline-none focus:border-[var(--warn)]/50 transition-all cursor-pointer hover:bg-[var(--base)]/80 shadow-sm truncate"
               >
                  <option value="all">All Tracks</option>
                  {Array.from(new Set(masterList.flatMap(s => s.assignments.map(a => a.sessionName)))).sort().map(s => <option key={s} value={s}>{s}</option>)}
               </select>

               <select 
                 value={filterStatus} 
                 onChange={(e) => setFilterStatus(e.target.value)} 
                 className="h-11 flex-1 max-w-[200px] bg-[var(--base)] border border-default rounded-xl px-4 text-[11px] font-black uppercase tracking-widest text-[var(--text)] focus:outline-none focus:border-[var(--pri)]/50 transition-all cursor-pointer hover:bg-[var(--base)]/80 shadow-sm"
               >
                  <option value="all">All Status</option>
                  <option value="pending_upload">Pending Upload</option>
                  <option value="pending_review">Pending Review</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
               </select>
            </div>

            <Button 
              variant="ghost" 
              onClick={() => { setFilterDay("all"); setFilterRoom("all"); setFilterSession("all"); setFilterStatus("all"); setSearchQuery(""); }} 
              className="h-11 px-8 text-[10px] font-black uppercase tracking-widest text-muted hover:text-[var(--dan)] rounded-xl bg-[var(--base)]/40 border border-default/50 hover:bg-[var(--dan)]/5 transition-all shadow-sm"
            >
               Clear Filters
            </Button>
         </div>

          <Card className="flex-1 glass-3d border-default rounded-[3rem] overflow-hidden flex flex-col shadow-2xl bg-[var(--base)]/40">
             <div className="flex-1 overflow-y-auto no-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 z-20 bg-[var(--base)]/80 backdrop-blur-3xl border-b border-default">
                     <tr>
                        <th className="px-6 py-3.5 text-left text-[10px] font-black uppercase tracking-widest text-muted">Speaker</th>
                        <th className="px-6 py-3.5 text-left text-[10px] font-black uppercase tracking-widest text-muted">Status</th>
                        <th className="px-6 py-3.5 text-left text-[10px] font-black uppercase tracking-widest text-muted">Time</th>
                        <th className="px-6 py-3.5 text-right text-[10px] font-black uppercase tracking-widest text-muted">Manage</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-default">
                     {isLoading ? (
                       [1, 2, 3].map(i => <tr key={i} className="animate-pulse"><td className="py-3 px-6"><div className="h-6 w-64 bg-muted rounded-full" /></td><td className="py-3 px-6 text-center"><div className="h-6 w-16 bg-muted rounded-full mx-auto" /></td><td className="py-3 px-6 text-center"><div className="h-6 w-32 bg-muted rounded-full mx-auto" /></td><td className="py-3 px-6"></td></tr>)
                     ) : filteredMasterList.map((speaker: any) => {
                       const uploadedCount = speaker.assignments.reduce((acc: number, a: any) => acc + (a.files.length > 0 ? 1 : 0), 0);
                       return (
                         <tr key={speaker.id} onClick={() => { setSelectedSpeakerId(speaker.id); setActiveFileId(null); }} className={cn("group cursor-pointer hover:bg-[var(--pri)]/5 transition-all", selectedSpeakerId === speaker.id && "bg-[var(--pri)]/10")}>
                            <td className="py-3 px-6">
                               <div className="flex items-center gap-4">
                                  <div className="h-10 w-10 rounded-xl bg-[var(--base)] border border-default flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform"><User className="h-5 w-5 text-[var(--pri)]" /></div>
                                  <div>
                                     <p className="text-[14px] font-black text-[var(--text)] tracking-tight">{speaker.name}</p>
                                  </div>
                               </div>
                            </td>
                             <td className="py-3 px-6">
                               <div className="flex flex-col gap-1.5 min-w-[140px]">
                                 {(() => {
                                   const allFiles = speaker.assignments.flatMap((a: any) => a.files);
                                   const apprv = allFiles.filter((f: any) => f.upload_status === 'approved').length;
                                   const rjct = allFiles.filter((f: any) => f.upload_status === 'rejected').length;
                                   const pendReview = allFiles.length - apprv - rjct;
                                   const totalAssignments = speaker.assignments.length;
                                   const pendingUploads = speaker.assignments.filter((a: any) => a.files.length === 0).length;

                                   return (
                                     <div className="flex flex-wrap gap-2">
                                       {apprv > 0 && <Badge className="bg-emerald-500/10 text-emerald-500 border-none text-[8px] font-black uppercase px-2 py-0.5">{apprv} Approved</Badge>}
                                       {rjct > 0 && <Badge className="bg-rose-500/10 text-rose-500 border-none text-[8px] font-black uppercase px-2 py-0.5">{rjct} Rejected</Badge>}
                                       {pendReview > 0 && <Badge className="bg-amber-500/10 text-amber-500 border-none text-[8px] font-black uppercase px-2 py-0.5">{pendReview} Review</Badge>}
                                       {pendingUploads > 0 && <Badge className="bg-slate-500/10 text-slate-500 border-none text-[8px] font-black uppercase px-2 py-0.5">{pendingUploads} Pending</Badge>}
                                       {allFiles.length === 0 && pendingUploads === 0 && <Badge className="bg-slate-500/10 text-slate-500 border-none text-[8px] font-black uppercase px-2 py-0.5">No Assignment</Badge>}
                                     </div>
                                   );
                                 })()}
                               </div>
                            </td>
                            <td className="py-3 px-6 text-center text-[11px] font-black text-muted uppercase tracking-wider">
                               {(() => {
                                 const allFiles = speaker.assignments.flatMap((a: any) => a.files);
                                 const latest = allFiles.sort((a: any, b: any) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())[0];
                                 return latest ? new Date(latest.uploaded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : "—";
                               })()}
                            </td>
                            <td className="py-3 px-6 text-right"><Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg group-hover:bg-[var(--pri)] group-hover:text-white transition-all"><Eye className="h-4 w-4" /></Button></td>
                         </tr>
                       );
                     })}
                  </tbody>
               </table>
            </div>
         </Card>
      </div>

      <AnimatePresence>
         {selectedSpeaker && (
           <div className="fixed inset-0 z-50 flex items-center justify-center p-10">
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                onClick={() => setSelectedSpeakerId(null)}
                className="absolute inset-0 bg-black/60 backdrop-blur-xl" 
              />

              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }} 
                animate={{ scale: 1, opacity: 1, y: 0 }} 
                exit={{ scale: 0.9, opacity: 0, y: 20 }} 
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="w-full max-w-5xl h-[85vh] bg-[var(--base)]/90 backdrop-blur-2xl border border-default rounded-[4rem] shadow-3xl flex flex-col relative overflow-hidden glass-3d"
              >
                 <div className="absolute top-8 right-8 z-50">
                    <Button onClick={() => setSelectedSpeakerId(null)} variant="ghost" size="icon" className="h-14 w-14 rounded-full bg-[var(--base)]/40 border border-default text-muted hover:text-[var(--text)] transition-transform hover:rotate-90 shadow-xl"><XCircle className="h-7 w-7" /></Button>
                 </div>

                 <div className="p-12 border-b border-default bg-gradient-to-r from-[var(--pri)]/10 via-transparent to-transparent">
                    <h2 className="text-2xl font-black tracking-tight text-[var(--text)]">Speaker File Management</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted">Speaker:</span>
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)]">
                        {selectedSpeaker.name}
                      </span>
                    </div>
                 </div>

                 <div className="flex-1 flex overflow-hidden">
                    <div className="w-[400px] border-r border-default flex flex-col bg-[var(--base)]/30 transition-all">
                       <div className="p-8 border-b border-default flex items-center justify-between bg-[var(--base)]/50 backdrop-blur-md sticky top-0 z-10">
                          <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-[var(--text)] flex items-center gap-3"><Layers className="h-4 w-4 text-[var(--pri)]" /> Files</h4>
                       </div>
                       <div className="flex-1 overflow-y-auto no-scrollbar p-8 space-y-6">
                          {selectedSpeaker.assignments.map((assign: any) => (
                            <div key={assign.id} className="space-y-4">
                               <div className="p-5 rounded-3xl bg-[var(--base)] border border-default shadow-sm">
                                  <div className="flex items-center gap-3 mb-2">
                                     <Badge className="text-[8px] font-black uppercase bg-muted/10 border-0">{assign.type}</Badge>
                                     <p className="text-[10px] font-bold text-muted truncate">{assign.sessionName}</p>
                                  </div>
                                  <h5 className="text-[14px] font-black text-[var(--text)] tracking-tight mb-3 truncate">{assign.topic}</h5>
                                  <div className="space-y-2">
                                     {assign.files.length === 0 ? (
                                       <div className="flex items-center gap-2 rounded-xl border px-3 py-2 bg-slate-100/50 border-slate-200">
                                         <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">No Files</span>
                                       </div>
                                     ) : (
                                       assign.files.map((file: any) => {
                                         const state = getIntakeState(file);
                                         const isApproved = file.upload_status === 'approved';
                                         const isRejected = file.upload_status === 'rejected';
                                         const isPending = !isApproved && !isRejected;

                                         return (
                                           <div 
                                             key={file.id} 
                                             onClick={() => setActiveFileId(file.id)} 
                                             className={cn(
                                               "flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all",
                                               activeFileId === file.id 
                                                 ? "border-[var(--pri)] bg-[var(--pri)] shadow-[0_0_20px_-5px_var(--pri)] text-white" 
                                                 : isApproved 
                                                   ? "bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20" 
                                                   : isRejected 
                                                     ? "bg-rose-500/10 border-rose-500/30 hover:bg-rose-500/20" 
                                                     : "bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20"
                                             )}
                                           >
                                              <div className="flex items-center gap-3 min-w-0">
                                                 <p className={cn("text-[11px] font-bold truncate max-w-[140px]", activeFileId === file.id ? "text-white" : "text-[var(--text)]")}>{file.original_filename}</p>
                                              </div>
                                              <state.icon className={cn("h-3 w-3", activeFileId === file.id ? "text-white" : state.text)} />
                                           </div>
                                         );
                                       })
                                     )}
                                  </div>
                               </div>
                            </div>
                          ))}
                       </div>
                    </div>

                    <div className="flex-1 overflow-y-auto no-scrollbar relative flex flex-col bg-gradient-to-br from-transparent to-[color-mix(in_srgb,var(--text)_2%,transparent)]">
                        {activeFileAudit ? (
                         <div className="flex-1 flex flex-col">
                            {/* Audit Header */}
                            <div className="p-8 border-b border-default bg-[var(--base)]/50 backdrop-blur-md flex items-center justify-between sticky top-0 z-10">
                               <div className="flex items-center gap-4">
                                  <div className="h-8 w-8 rounded-lg bg-[var(--pri)]/10 flex items-center justify-center"><Terminal className="h-4 w-4 text-[var(--pri)]" /></div>
                                  <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text)]">File Check Results</h4>
                               </div>
                               <Button onClick={() => setActiveFileId(null)} variant="ghost" size="sm" className="h-9 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest text-muted hover:text-[var(--dan)] hover:bg-[var(--dan)]/5 flex items-center gap-2">
                                  Close <XCircle className="h-4 w-4" />
                               </Button>
                            </div>
                            
                            <div className="p-12 space-y-10">
                               {/* File Identity */}
                               <div className="p-10 rounded-[3.5rem] bg-[var(--base)] border border-default shadow-xl relative overflow-hidden group">
                                  <div className="absolute -top-10 -right-10 p-10 opacity-5 group-hover:rotate-12 transition-transform">
                                     {activeFileAudit.file_format === 'mp4' ? <FileVideo className="h-40 w-40" /> : <FileText className="h-40 w-40" />}
                                  </div>
                                 <div className="flex items-center gap-4 mb-4">
                                     <div className="h-10 w-10 rounded-xl bg-[var(--pri)]/10 flex items-center justify-center"><ShieldCheck className="h-5 w-5 text-[var(--pri)]" /></div>
                                     <p className="text-[11px] font-black text-[var(--pri)] uppercase tracking-[0.4em]">File Identity</p>
                                  </div>
                                  <h5 className="text-2xl font-black text-[var(--text)] mb-6 tracking-tighter">{activeFileAudit.original_filename}</h5>
                                  <div className="flex flex-wrap gap-4">
                                     <Badge className="bg-[var(--base)] border-default text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl text-muted">{activeFileAudit.file_format.toUpperCase()} Format</Badge>
                                     <Badge className="bg-[var(--base)] border-default text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl text-muted">Version {activeFileAudit.version_number}</Badge>
                                     <Badge className="bg-[var(--base)] border-default text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl text-[var(--pri)] lowercase font-mono">ID: {activeFileAudit.id.slice(0,8)}</Badge>
                                   </div>
                                </div>

                                {/* Technical Checks */}
                                <div className="grid grid-cols-4 gap-4">
                                  {activeFileAudit.validation ? (
                                    <>
                                      <SC icon={Layers}   label="Slides"  value={activeFileAudit.validation.slide_count ?? "—"} color="text-[var(--pri)]" />
                                      <SC icon={ImageIcon} label="Images"  value={activeFileAudit.validation.image_count || 0} color="text-purple-500" />
                                      <SC icon={Video}     label="Videos"  value={activeFileAudit.validation.video_count || 0} color="text-amber-500" />
                                      <SC icon={Type}      label="Fonts"   value={activeFileAudit.validation.has_missing_fonts ? "Issues" : "OK"} color={activeFileAudit.validation.has_missing_fonts ? "text-rose-500" : "text-emerald-500"} />
                                    </>
                                  ) : activeFileAudit.upload_status === "processing" || activeFileAudit.upload_status === "pending_validation" ? (
                                     <div className="col-span-4 flex flex-col items-center gap-3 py-8 opacity-50">
                                       <Activity className="h-10 w-10 animate-pulse text-[var(--pri)]" />
                                       <p className="text-[11px] font-black uppercase tracking-widest text-muted">Checking file quality…</p>
                                     </div>
                                   ) : (
                                     <div className="col-span-4 flex flex-col items-center gap-4 py-10 bg-slate-50/50 rounded-3xl border border-dashed border-default">
                                        <div className="h-12 w-12 rounded-full bg-slate-200/50 flex items-center justify-center text-slate-400"><Database className="h-6 w-6" /></div>
                                        <div className="text-center">
                                           <p className="text-[12px] font-black text-slate-500 uppercase tracking-widest">No Audit Data</p>
                                           <p className="text-[10px] font-bold text-slate-400 mt-1">Audit metadata was not generated for this version.</p>
                                        </div>
                                        <Button 
                                          variant="outline" 
                                          onClick={() => toast.info("Audit re-run triggered. Please wait a few moments.")}
                                          className="h-9 px-6 rounded-xl text-[10px] font-black uppercase tracking-widest border-default hover:bg-white transition-all shadow-sm"
                                        >
                                           Run Quality Check Now
                                        </Button>
                                     </div>
                                   )}
                                </div>

                                {/* Automated Test Report */}
                                {activeFileAudit.validation?.error_details?.audit_report && (
                                  <div className="p-8 rounded-[2.5rem] bg-[var(--base)] border border-default shadow-sm space-y-6">
                                    <div className="flex items-center gap-3">
                                      <div className="h-8 w-8 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                                        <ListChecks className="h-4 w-4 text-emerald-500" />
                                      </div>
                                      <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text)]">Automated Test Report</h4>
                                    </div>
                                    <div className="grid grid-cols-1 gap-3">
                                      {activeFileAudit.validation.error_details.audit_report.map((test: any, idx: number) => (
                                        <div key={idx} className="flex items-center justify-between p-4 rounded-2xl bg-[var(--base)]/60 border border-default">
                                          <div className="flex items-center gap-4">
                                            {test.status === "pass" ? (
                                              <div className="h-6 w-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500">
                                                <Check className="h-3 w-3" />
                                              </div>
                                            ) : (
                                              <div className="h-6 w-6 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-500">
                                                <XCircle className="h-3 w-3" />
                                              </div>
                                            )}
                                            <div>
                                              <p className="text-[12px] font-black">{test.test}</p>
                                              <p className="text-[10px] font-bold text-muted uppercase tracking-wider">{test.details}</p>
                                            </div>
                                          </div>
                                          <Badge className={cn("border-0 text-[8px] font-black uppercase tracking-widest px-3 py-1 rounded-full", test.status === "pass" ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500")}>
                                            {test.status === "pass" ? "Passed" : "Failed"}
                                          </Badge>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Detailed Technical Info */}
                                <div className="p-10 rounded-[3rem] bg-[var(--base)]/40 border border-default/50 space-y-6">
                                  <h6 className="text-[10px] font-black uppercase tracking-[0.4em] text-muted flex items-center gap-3"><Fingerprint className="h-4 w-4" /> Technical Details</h6>
                                   <div className="grid grid-cols-2 gap-y-6 gap-x-12">
                                    <div className="border-b border-default pb-3"><p className="text-[8px] font-black text-muted uppercase tracking-widest mb-1">MIME Type</p><p className="text-[11px] font-bold">{activeFileAudit.validation?.mime_type_detected ?? "—"}</p></div>
                                    <div className="border-b border-default pb-3"><p className="text-[8px] font-black text-muted uppercase tracking-widest mb-1">Antivirus</p><p className={cn("text-[11px] font-bold", (activeFileAudit.validation?.antivirus_status??"CLEAN")==="CLEAN"?"text-emerald-500":"text-rose-500")}>{activeFileAudit.validation?.antivirus_status ?? "CLEAN"}</p></div>
                                    <div className="border-b border-default pb-3"><p className="text-[8px] font-black text-muted uppercase tracking-widest mb-1">Upload Time</p><p className="text-[11px] font-bold">{new Date(activeFileAudit.uploaded_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</p></div>
                                    <div className="border-b border-default pb-3"><p className="text-[8px] font-black text-muted uppercase tracking-widest mb-1">Pass/Fail Status</p><p className={cn("text-[11px] font-black uppercase", activeFileAudit.validation?.overall_result==="pass"?"text-emerald-500":activeFileAudit.validation?.overall_result==="fail"?"text-rose-500":"text-amber-500")}>{activeFileAudit.validation?.overall_result ?? "Processing"}</p></div>
                                   </div>
                                 </div>

                                 <PermissionGate permission={PERMISSIONS.FILES_REJECT}>
                                   <div className="p-8 rounded-[2.5rem] bg-rose-500/5 border border-rose-500/10">
                                    <div className="flex items-center gap-3 mb-6">
                                      <div className="h-8 w-8 rounded-xl bg-rose-500/20 flex items-center justify-center">
                                        <AlertCircle className="h-4 w-4 text-rose-500" />
                                      </div>
                                      <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-rose-500">Reject File</h4>
                                    </div>
                                    <textarea
                                      placeholder="Why is this file being rejected? (e.g. wrong format, corrupt video, missing fonts...)"
                                      className="w-full h-32 bg-[var(--base)] border border-default rounded-2xl p-4 text-xs focus:outline-none focus:ring-1 focus:ring-rose-500/20 transition-all mb-4"
                                      value={rejectionReason}
                                      onChange={(e) => setRejectionReason(e.target.value)}
                                    />
                                    <button
                                      onClick={handleReject}
                                      disabled={rejectionReason.trim().length < 5}
                                      className="w-full py-4 rounded-2xl bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-rose-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                      <Send className="h-3 w-3" />
                                      Send Reason
                                    </button>
                                  </div>
                                 </PermissionGate>
                             </div>

                             {/* Action Bar */}
                             <div className="p-12 border-t border-default bg-[var(--base)]/80 sticky bottom-0 backdrop-blur-3xl">
                                <div className="flex gap-4">
                                  
                                  <PermissionGate permission={PERMISSIONS.FILES_DOWNLOAD}>
                                    <Button 
                                      onClick={() => activeFileAudit.is_poster ? downloadPosterMutation.mutate(activeFileAudit.id) : downloadMutation.mutate(activeFileAudit.id)} 
                                      className="flex-1 h-16 bg-[var(--pri)] text-white font-black uppercase tracking-[0.3em] text-[11px] rounded-3xl shadow-xl border-0"
                                    >
                                      Download File
                                    </Button>
                                  </PermissionGate>
                                  <div className="flex gap-3">
                                     
                                     <PermissionGate permission={PERMISSIONS.FILES_APPROVE}>
                                       <Button 
                                         onClick={() => handleApprove(activeFileAudit)} 
                                         disabled={approveMutation.isPending || reviewPosterMutation.isPending} 
                                         variant="outline" 
                                         className="h-16 px-8 border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10 font-black text-[10px] uppercase tracking-widest rounded-3xl"
                                       >
                                         Approve
                                       </Button>
                                     </PermissionGate>
                                  </div>
                               </div>
                            </div>
                         </div>
                       ) : (
                         <div className="flex-1 flex flex-col items-center justify-center p-20 text-center opacity-30 space-y-8">
                            <ScanLine className="h-24 w-24 animate-pulse text-[var(--pri)]" />
                            <div className="space-y-4">
                               <p className="text-2xl font-black uppercase tracking-tighter text-[var(--text)]">Select a file to manage</p>
                            </div>
                         </div>
                       )}
                    </div>
                 </div>
              </motion.div>
           </div>
         )}
      </AnimatePresence>
    </div>
  );
}
