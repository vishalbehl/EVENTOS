"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { FileUp, Upload, CheckCircle2, AlertCircle, Loader2, FileText, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";

export default function GlobalPosterUploadPage() {
  const params = useParams();
  const router = useRouter();
  const token = (params.token as string) || "";

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);

    try {
      // 1. Get presigned upload URL
      const presignRes = await apiClient.post(`/portal/poster/upload-url`, {
        filename: file.name,
        file_size_bytes: file.size,
        mime_type: file.type || "application/pdf",
      }, {
        params: { token },
      });

      const { upload_url, poster_id } = presignRes.data;

      if (upload_url) {
        await fetch(upload_url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "application/pdf" },
        });
      }

      // 2. Confirm poster upload
      await apiClient.post(`/portal/poster/${poster_id}/confirm`, {}, {
        params: { token },
      });

      setUploadSuccess(true);
      toast.success("Poster uploaded successfully!");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to upload poster");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      <Card className="border border-[var(--border-default)] bg-[var(--card)] shadow-xl overflow-hidden">
        <CardHeader className="border-b border-[var(--border-default)] pb-4">
          <CardTitle className="text-base font-bold text-[var(--text)]">Poster Presentation Submission</CardTitle>
          <CardDescription className="text-xs text-[var(--muted)]">Upload your digital poster (PDF) for display on e-poster kiosks and abstract books</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 pt-6 text-xs">
          {uploadSuccess ? (
            <div className="py-8 text-center space-y-4">
              <div className="h-14 w-14 rounded-full bg-[var(--status-success-muted)] border border-[var(--status-success)]/30 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-8 w-8 text-[var(--status-success)]" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[var(--text)]">Poster Uploaded Successfully!</h3>
                <p className="text-xs text-[var(--muted)] mt-1">Your e-poster has been submitted and queued for technical validation.</p>
              </div>
            </div>
          ) : (
            <div className="p-8 rounded-xl border-2 border-dashed border-[var(--border-default)] bg-[var(--bg-surface-2)] hover:border-[var(--pri)] transition-colors text-center space-y-3">
              <div className="mx-auto h-12 w-12 rounded-xl bg-[color-mix(in_srgb,var(--pri)_12%,transparent)] flex items-center justify-center">
                <FileUp className="h-6 w-6 text-[var(--pri)]" />
              </div>

              <div>
                <p className="font-bold text-sm text-[var(--text)]">
                  {file ? file.name : "Select Digital Poster (PDF)"}
                </p>
                <p className="text-xs text-[var(--muted)] mt-0.5">
                  High resolution PDF format (Portrait or Landscape, max 100MB)
                </p>
              </div>

              <label className="inline-flex">
                <Button asChild size="sm" className="cursor-pointer">
                  <span>
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    {file ? "Choose Another File" : "Select PDF File"}
                  </span>
                </Button>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>
            </div>
          )}
        </CardContent>

        {!uploadSuccess && (
          <CardFooter className="flex justify-end border-t border-[var(--border-default)] pt-4">
            <Button onClick={handleUpload} disabled={!file || uploading} className="flex items-center gap-2">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              <span>Upload Poster</span>
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
