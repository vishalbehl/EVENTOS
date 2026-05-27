"use client";

import { useState, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { 
  usePortalAuth, useRequestUploadUrl, useConfirmUpload,
  useRequestPosterUploadUrl, useConfirmPosterUpload 
} from "@/hooks/usePortal";
import { useDeadlineStatus } from "@/hooks/useDeadlineStatus";
import { DeadlineBanner } from "@/components/DeadlineBanner";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, CloudUpload, FileText, CheckCircle2, 
  X, AlertCircle, Info, ChevronRight, Loader2,
  Shield, ShieldCheck, Monitor, Lock, AlertTriangle
} from "lucide-react";
import Link from "next/link";
import axios from "axios";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PortalHeader } from "@/components/PortalHeader";
import { TermsModal, RecordingRights } from "@/components/TermsModal";
import JSZip from "jszip";

export default function UploadPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = params.token as string;
  const slotId = searchParams.get("slot");
  const posterId = searchParams.get("poster");

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isFolderMode, setIsFolderMode] = useState(false);
  const [folderFiles, setFolderFiles] = useState<File[]>([]);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const { data: portal, isLoading } = usePortalAuth(token);
  const requestUpload = useRequestUploadUrl();
  const confirmUpload = useConfirmUpload();
  const requestPosterUpload = useRequestPosterUploadUrl();
  const confirmPosterUpload = useConfirmPosterUpload();

  // Deadline awareness
  const deadlineInfo = useDeadlineStatus(
    portal?.upload_deadline ?? null,
    portal?.allow_override ?? false
  );

  const talk = portal?.talks.find(t => t.session_speaker_id === slotId);
  const poster = portal?.posters.find(p => p.id === posterId);
  
  const targetName = talk ? (talk.talk_title || talk.session_name) : poster?.title;
  const isPoster = !!posterId;
  const speakerName = portal ? `${portal.first_name} ${portal.last_name}` : "";

  const isDeadlineLocked = deadlineInfo.isLocked;
  const isLateOverride = deadlineInfo.status === "override";

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-10 w-10 text-indigo-500 animate-spin" />
        <span className="text-[10px] font-black text-muted uppercase tracking-[0.3em]">Preparing environment</span>
      </div>
    </div>
  );
  
  if (!portal || (!talk && !poster)) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="glass-3d p-10 max-w-sm text-center rounded-[2.5rem]">
        <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-black mb-2 uppercase tracking-tighter">Invalid Item</h2>
        <p className="text-muted text-sm mb-6 font-bold">This upload slot could not be verified.</p>
        <Link href={`/${token}`} className="btn-primary w-full rounded-full">Go Back</Link>
      </div>
    </div>
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const maxSize = portal.max_file_size_mb * 1024 * 1024;
      if (selectedFile.size > maxSize) {
        toast.error(`File too large. Max size is ${portal.max_file_size_mb}MB.`);
        return;
      }
      
      const ext = selectedFile.name.split('.').pop()?.toLowerCase() || '';
      
      if (!isPoster && portal.allowed_formats.length > 0 && !portal.allowed_formats.includes(ext)) {
        toast.error(`Invalid format. Allowed: ${portal.allowed_formats.join(', ')}`);
        return;
      }

      setError(null);
      setFile(selectedFile);
      setFolderFiles([]);
      toast.success("File selected successfully!");
    }
  };

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      const totalSize = files.reduce((acc, f) => acc + f.size, 0);
      const maxSize = (isPoster ? 100 : portal?.max_file_size_mb || 50) * 1024 * 1024;
      
      if (totalSize > maxSize) {
        toast.error(`Folder too large. Max size is ${isPoster ? 100 : portal?.max_file_size_mb}MB.`);
        return;
      }

      setError(null);
      setFolderFiles(files);
      setFile(null);
      toast.success(`Folder selected: ${files.length} files staged.`);
    }
  };

  const handleInitialSubmit = () => {
    if (!file && folderFiles.length === 0) return;
    setIsTermsOpen(true);
  };

  const handleUpload = async (rights: RecordingRights) => {
    setUploading(true);
    setIsTermsOpen(false);
    setProgress(0);
    setError(null);

    try {
      let fileToUpload: File | Blob = file as File;
      let filename = file?.name || "folder-upload.zip";

      if (isFolderMode && folderFiles.length > 0) {
        toast.info("Bundling folder contents...");
        const zip = new JSZip();
        folderFiles.forEach(f => {
          const path = (f as any).webkitRelativePath || f.name;
          zip.file(path, f);
        });
        fileToUpload = await zip.generateAsync({ type: "blob" });
        filename = `${portal?.first_name}_${portal?.last_name}_assets.zip`;
      }
      if (isPoster && posterId) {
        const { upload_url } = await requestPosterUpload.mutateAsync({
          token,
          posterId,
          data: {
            filename: filename,
            file_size_bytes: fileToUpload.size,
            mime_type: isFolderMode ? 'application/zip' : (file?.type || 'application/octet-stream'),
            recording_rights: rights
          }
        });

        await axios.put(upload_url, fileToUpload, {
          headers: { 'Content-Type': isFolderMode ? 'application/zip' : (file?.type || 'application/octet-stream') },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || fileToUpload.size));
            setProgress(percentCompleted);
          }
        });

        await confirmPosterUpload.mutateAsync({ token, posterId });
        toast.success("ePoster uploaded successfully!");
      } else if (slotId) {
        const { upload_url, file_id } = await requestUpload.mutateAsync({
          token,
          data: {
            session_speaker_id: slotId,
            filename: filename,
            file_size_bytes: fileToUpload.size,
            mime_type: isFolderMode ? 'application/zip' : (file?.type || 'application/octet-stream'),
            file_format: filename.split('.').pop()?.toLowerCase() || 'unknown',
            recording_rights: rights
          }
        });

        await axios.put(upload_url, fileToUpload, {
          headers: { 'Content-Type': isFolderMode ? 'application/zip' : (file?.type || 'application/octet-stream') },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || fileToUpload.size));
            setProgress(percentCompleted);
          }
        });

        await confirmUpload.mutateAsync({ token, data: { file_id } });
        toast.success("Presentation uploaded successfully!");
      }
      
      router.push(`/${token}/thankyou`);
    } catch (err: any) {
      console.error("Upload failed:", err);
      let msg = "System error during upload.";
      
      const detail = err.response?.data?.detail;
      if (typeof detail === 'string') {
        msg = detail;
      } else if (Array.isArray(detail)) {
        msg = detail.map((d: any) => `${d.loc.join('.')}: ${d.msg}`).join(', ');
      } else if (detail && typeof detail === 'object') {
        msg = JSON.stringify(detail);
      }
      
      setError(msg);
      toast.error(msg);
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {portal?.theme_color && (
        <style dangerouslySetInnerHTML={{ __html: `
          :root {
            --pri: ${portal.theme_color};
            --sec: color-mix(in srgb, ${portal.theme_color} 80%, white);
          }
        `}} />
      )}
      {/* Sticky deadline banner */}
      <DeadlineBanner deadlineInfo={deadlineInfo} className="sticky top-0 z-[60]" />

      <PortalHeader speakerName={speakerName} token={token} />

      <main className="flex-1 max-w-4xl mx-auto w-full px-6 md:px-10 py-12">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="mb-12">
          <Link 
            href={`/${token}`} 
            className="inline-flex items-center gap-2 text-[10px] font-black text-muted uppercase tracking-[0.2em] hover:text-indigo-400 transition-colors group"
          >
            <ArrowLeft className="h-3 w-3 group-hover:-translate-x-1 transition-transform" /> Back to Hub
          </Link>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-3d overflow-hidden rounded-[2.5rem]"
        >
          <div className="h-2 w-full bg-indigo-500/10 relative">
            {uploading && (
              <motion.div 
                className="absolute top-0 left-0 h-full bg-indigo-500"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              />
            )}
          </div>

          <div className="p-10 md:p-14">
            <header className="mb-12">
              <h1 className="text-4xl font-black tracking-tighter mb-2">
                Sync <span className="text-indigo-400">{isPoster ? "Digital Poster" : "Presentation"}</span>
              </h1>
              <p className="text-muted font-bold text-sm">
                Target Item: <span className="text-[#E8EAFF]">{targetName}</span>
              </p>
            </header>

            {/* ── Late submission warning ── */}
            {isLateOverride && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8 flex items-start gap-4 p-5 rounded-[1.5rem] bg-yellow-500/8 border border-yellow-500/20"
              >
                <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[12px] font-black text-yellow-400 uppercase tracking-widest mb-1">
                    Late Submission — Approval Required
                  </p>
                  <p className="text-[11px] font-bold text-muted leading-relaxed">
                    The upload deadline has passed. Your organiser has granted you a late submission window. 
                    Files submitted now will be flagged for manual review before being accepted.
                  </p>
                </div>
              </motion.div>
            )}

            {/* ── Deadline locked: show blocking message instead of dropzone ── */}
            {isDeadlineLocked ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center gap-6 py-24 px-10 text-center border-2 border-dashed border-red-500/20 rounded-[2.5rem] bg-red-500/5"
              >
                <div className="h-20 w-20 rounded-3xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                  <Lock className="h-10 w-10 text-red-400" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-red-400 uppercase tracking-tight mb-3">
                    Upload Deadline Has Passed
                  </h3>
                  <p className="text-[13px] font-bold text-muted max-w-sm leading-relaxed">
                    The submission window for this event has closed. If you need to submit a file, 
                    please contact your organiser directly.
                  </p>
                </div>
                <Link
                  href={`/${token}`}
                  className="mt-4 inline-flex items-center gap-2 text-[10px] font-black text-muted uppercase tracking-[0.2em] hover:text-indigo-400 transition-colors border border-white/10 rounded-full px-6 py-3 hover:border-indigo-500/30"
                >
                  <ArrowLeft className="h-3 w-3" /> Back to Hub
                </Link>
              </motion.div>
            ) : (
              /* ── Normal / Late-override dropzone ── */
              <>
                <div 
                  className={cn(
                    "relative border-2 border-dashed rounded-[2.5rem] transition-all duration-500 overflow-hidden group",
                    (file || folderFiles.length > 0) 
                      ? isLateOverride 
                        ? "border-yellow-500/50 bg-yellow-500/5"
                        : "border-indigo-500/50 bg-indigo-500/5" 
                      : isLateOverride
                        ? "border-yellow-500/20 hover:border-yellow-500/40 hover:bg-yellow-500/[0.02]"
                        : "border-white/10 hover:border-indigo-500/30 hover:bg-white/[0.02]",
                    uploading ? "pointer-events-none opacity-60" : "cursor-pointer"
                  )}
                  onClick={() => !uploading && (isFolderMode ? folderInputRef.current?.click() : fileInputRef.current?.click())}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    onChange={handleFileChange}
                    disabled={uploading}
                  />

                  <input 
                    type="file" 
                    ref={folderInputRef} 
                    className="hidden" 
                    onChange={handleFolderChange}
                    disabled={uploading}
                    {...{ webkitdirectory: "", directory: "" } as any}
                  />
                  
                  <div className="p-12 md:p-20 text-center flex flex-col items-center gap-6">
                    <div className={cn(
                      "h-20 w-20 rounded-3xl flex items-center justify-center transition-all duration-500",
                      (file || folderFiles.length > 0) 
                        ? isLateOverride ? "bg-yellow-500 shadow-[0_0_40px_rgba(234,179,8,0.3)]" : "bg-indigo-500 shadow-[0_0_40px_rgba(99,102,241,0.3)]"
                        : isLateOverride
                          ? "bg-white/5 border border-white/5 group-hover:bg-yellow-500/10 group-hover:border-yellow-500/20"
                          : "bg-white/5 border border-white/5 group-hover:bg-indigo-500/10 group-hover:border-indigo-500/20"
                    )}>
                      {isFolderMode ? <Monitor className="h-10 w-10 text-white" /> : (file ? <FileText className="h-10 w-10 text-white" /> : <CloudUpload className={cn("h-10 w-10 text-muted", isLateOverride ? "group-hover:text-yellow-400" : "group-hover:text-indigo-400")} />)}
                    </div>
                    
                    <AnimatePresence mode="wait">
                      {file || folderFiles.length > 0 ? (
                        <motion.div 
                          key="file-info"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                        >
                          <div className="text-xl font-black tracking-tight mb-1 truncate max-w-xs">
                            {isFolderMode ? `Folder: ${folderFiles.length} files` : file?.name}
                          </div>
                          <div className="text-[10px] font-black text-muted uppercase tracking-widest italic">
                            {((file?.size || folderFiles.reduce((a,f) => a+f.size, 0)) / (1024 * 1024)).toFixed(2)} MB • Staging Completed
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div 
                          key="empty-info"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                        >
                          <div className="text-xl font-black tracking-tight mb-1 uppercase tracking-tighter">
                            {isFolderMode ? "Select full folder to transmit" : "Click to browse ecosystem"}
                          </div>
                          <div className="text-[10px] font-black text-muted uppercase tracking-widest flex items-center justify-center gap-2">
                            <Info className="h-3 w-3" /> Limits: {isPoster ? "100" : portal.max_file_size_mb}MB • {isPoster ? "All Formats" : portal.allowed_formats.join(', ')}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="mt-8 flex items-center justify-center gap-6">
                    <button 
                      onClick={() => setIsFolderMode(false)}
                      className={cn(
                        "text-[10px] font-black uppercase tracking-widest px-6 py-2 rounded-full border transition-all",
                        !isFolderMode 
                          ? isLateOverride ? "bg-yellow-500 border-yellow-500 text-black shadow-lg" : "bg-indigo-500 border-indigo-500 text-white shadow-lg"
                          : "bg-white/5 border-white/5 text-muted hover:bg-white/10"
                      )}
                    >
                      Single File
                    </button>
                    <button 
                      onClick={() => setIsFolderMode(true)}
                      className={cn(
                        "text-[10px] font-black uppercase tracking-widest px-6 py-2 rounded-full border transition-all",
                        isFolderMode 
                          ? isLateOverride ? "bg-yellow-500 border-yellow-500 text-black shadow-lg" : "bg-indigo-500 border-indigo-500 text-white shadow-lg"
                          : "bg-white/5 border-white/5 text-muted hover:bg-white/10"
                      )}
                    >
                      Full Folder
                    </button>
                </div>

                <div className="mt-12 space-y-6">
                  {uploading && (
                    <div className="space-y-3">
                      <div className="flex justify-between items-end">
                        <div className="text-[10px] font-black text-muted uppercase tracking-widest animate-pulse">Establishing Secure Uplink...</div>
                        <div className={cn("text-2xl font-black tracking-tighter", isLateOverride ? "text-yellow-400" : "text-indigo-400")}>{progress}%</div>
                      </div>
                      <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                        <motion.div 
                          className={cn("h-full rounded-full", isLateOverride ? "bg-gradient-to-r from-yellow-600 to-amber-400" : "bg-gradient-to-r from-indigo-600 to-emerald-400")}
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                    </div>
                  )}

                  <button
                    disabled={(!file && folderFiles.length === 0) || uploading}
                    onClick={handleInitialSubmit}
                    className={cn(
                      "w-full h-16 text-[11px] flex items-center justify-center gap-4 rounded-full font-black uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed",
                      isLateOverride
                        ? "bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/30 shadow-[0_10px_30px_rgba(234,179,8,0.15)]"
                        : "btn-primary"
                    )}
                  >
                    {uploading ? (
                      <>Transmitting Data Packets <Loader2 className="h-4 w-4 animate-spin" /></>
                    ) : isLateOverride ? (
                      <>Submit Late Filing <AlertTriangle className="h-4 w-4" /></>
                    ) : (
                      <>Finalize Transmission <ChevronRight className="h-4 w-4" /></>
                    )}
                  </button>
                  
                  <div className="flex items-start gap-4 p-5 rounded-[1.5rem] bg-indigo-500/5 border border-indigo-500/10">
                    <ShieldCheck className="h-5 w-5 text-indigo-400 flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] font-bold text-muted leading-relaxed">
                      Your presentation will be stored in an encrypted vault. Only authorized event technicians and organizers can access and review the content for quality assurance.
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </main>

      <TermsModal 
        isOpen={isTermsOpen} 
        onClose={() => setIsTermsOpen(false)} 
        onAccept={handleUpload}
        isSubmitting={uploading}
      />
    </div>
  );
}
