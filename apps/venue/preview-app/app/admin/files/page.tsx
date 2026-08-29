"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileText,
  Search,
  Filter,
  RefreshCw,
  UploadCloud,
  CheckCircle2,
  Clock,
  Lock,
  Unlock,
  Download,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

interface FileRow {
  id: string;
  filename: string;
  file_format: string;
  file_size_mb: number;
  version: number;
  upload_status: string;
  speaker_name: string;
  session_title: string;
  uploaded_at: string;
  is_locked: boolean;
}

export default function AdminFilesPage() {
  const [files, setFiles] = useState<FileRow[]>([]);

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchFiles = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiClient.get<FileRow[]>("/api/v1/srr/files");
      setFiles(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(err.message || "Unable to load presentation files from Venue Server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const toggleLock = async (fileId: string) => {
    const file = files.find((item) => item.id === fileId);
    if (!file) return;
    try {
      await apiClient.post(`/api/v1/srr/files/${fileId}/${file.is_locked ? "unlock" : "lock"}`);
      await fetchFiles();
      toast.success("File lock status updated");
    } catch (err: any) {
      toast.error(err.message || "File lock update failed.");
    }
  };

  const filtered = files.filter(
    (f) =>
      f.filename.toLowerCase().includes(search.toLowerCase()) ||
      (f.speaker_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (f.session_title || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <h1 className="text-2xl font-black text-[var(--text)] tracking-tight">
            Presentation Files Repository
          </h1>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Audit, lock, inspect, and override speaker presentation files stored on the Venue Server.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            onClick={fetchFiles}
            disabled={loading}
            className="gap-2 text-xs font-bold"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            Refresh Files
          </Button>
          <Button size="sm" className="gap-2 text-xs font-bold">
            <UploadCloud className="size-3.5" />
            Override Upload
          </Button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-[var(--muted)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by filename, speaker name, or session title..."
            className="pl-10 h-10 text-xs rounded-xl"
          />
        </div>
      </div>

      {/* Files Table */}
      <Card className="border-[var(--border)] bg-[var(--card)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--surf)] text-[10px] font-black uppercase tracking-wider text-[var(--muted)] border-b border-[var(--border)]">
              <tr>
                <th className="px-5 py-3">File Name</th>
                <th className="px-5 py-3">Speaker</th>
                <th className="px-5 py-3">Session</th>
                <th className="px-5 py-3">Size</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {filtered.map((f) => (
                <tr key={f.id} className="hover:bg-[var(--surf)]/50 transition-colors">
                  <td className="px-5 py-3.5 font-bold text-[var(--text)]">
                    <div className="flex items-center gap-2">
                      <FileText className="size-4 text-[var(--pri)] shrink-0" />
                      <span className="truncate max-w-xs">{f.filename}</span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--surf)] border border-[var(--border)] text-[var(--muted)]">
                        v{f.version}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-[var(--text)] font-medium">
                    {f.speaker_name}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-[var(--muted)] max-w-xs truncate">
                    {f.session_title}
                  </td>
                  <td className="px-5 py-3.5 text-xs font-mono text-[var(--text)]">
                    {f.file_size_mb} MB
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge variant="success" className="text-[9px]">
                      <CheckCircle2 className="size-3 mr-1" />
                      {f.upload_status}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => toggleLock(f.id)}
                        className={cn(
                          "p-1.5 rounded-lg border transition-colors",
                          f.is_locked
                            ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                            : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
                        )}
                        title={f.is_locked ? "Unlock File" : "Lock File from Modifications"}
                      >
                        {f.is_locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
