"use client";

import React, { useState, useEffect } from "react";
import { 
  FileText, Shield, ShieldAlert, ShieldCheck, 
  Trash2, Upload, Download, Tag, Search, RefreshCw, X 
} from "lucide-react";

interface Asset {
  id: string;
  name: string;
  file_path: string;
  file_size_bytes: number;
  mime_type: string;
  created_at: string;
  tags: string[];
  virus_scans: {
    status: string;
    scan_result: string;
    scanned_at: string;
  }[];
}

export default function FileVaultPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [newTagsText, setNewTagsText] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  const fetchAssets = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("eventos_original_token") || localStorage.getItem("eventos_token") || "";
      const url = new URL(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/files`);
      if (searchQuery) url.searchParams.append("q", searchQuery);
      if (selectedTag) url.searchParams.append("tag", selectedTag);

      const response = await fetch(url.toString(), {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setAssets(data);
      }
    } catch (err) {
      console.error("Failed to load assets:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssets();
  }, [searchQuery, selectedTag]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    
    setUploading(true);
    const token = localStorage.getItem("eventos_original_token") || localStorage.getItem("eventos_token") || "";
    
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/files/upload`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`
            },
            body: formData
          }
        );
        if (response.ok) {
          await fetchAssets();
        }
      } catch (err) {
        console.error("Upload failed for:", file.name, err);
      }
    }
    setUploading(false);
  };

  const handleAddTags = async (assetId: string) => {
    if (!newTagsText.trim()) return;
    const token = localStorage.getItem("eventos_original_token") || localStorage.getItem("eventos_token") || "";
    const tagList = newTagsText.split(",").map(t => t.trim()).filter(Boolean);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/files/${assetId}/tags`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ tags: tagList })
        }
      );
      if (response.ok) {
        setNewTagsText("");
        await fetchAssets();
        // Update selected asset info panel if active
        if (selectedAsset?.id === assetId) {
          const updated = await fetchAssetDetails(assetId);
          if (updated) setSelectedAsset(updated);
        }
      }
    } catch (err) {
      console.error("Failed to add tags:", err);
    }
  };

  const handleRemoveTag = async (assetId: string, tag: string) => {
    const token = localStorage.getItem("eventos_original_token") || localStorage.getItem("eventos_token") || "";
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/files/${assetId}/tags/${tag}`,
        {
          method: "DELETE",
          headers: {
            "Authorization": `Bearer ${token}`
          }
        }
      );
      if (response.ok) {
        await fetchAssets();
        if (selectedAsset?.id === assetId) {
          const updated = await fetchAssetDetails(assetId);
          if (updated) setSelectedAsset(updated);
        }
      }
    } catch (err) {
      console.error("Failed to remove tag:", err);
    }
  };

  const fetchAssetDetails = async (id: string): Promise<Asset | null> => {
    const token = localStorage.getItem("eventos_original_token") || localStorage.getItem("eventos_token") || "";
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/files/${id}`,
        {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        }
      );
      if (response.ok) {
        return await response.json();
      }
    } catch (err) {
      console.error("Details fetch error:", err);
    }
    return null;
  };

  const handleDeleteAsset = async (id: string) => {
    if (!confirm("Are you sure you want to delete this asset? This action is permanent.")) return;
    const token = localStorage.getItem("eventos_original_token") || localStorage.getItem("eventos_token") || "";
    
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/files/${id}`,
        {
          method: "DELETE",
          headers: {
            "Authorization": `Bearer ${token}`
          }
        }
      );
      if (response.ok) {
        setSelectedAsset(null);
        await fetchAssets();
      }
    } catch (err) {
      console.error("Delete asset error:", err);
    }
  };

  const getScanBadge = (scans: Asset["virus_scans"]) => {
    if (!scans || scans.length === 0) return (
      <span className="inline-flex items-center gap-1 rounded bg-yellow-500/10 px-2 py-0.5 text-xs font-bold text-yellow-400">
        <Shield className="h-3 w-3" /> Unscanned
      </span>
    );
    const latest = scans[0];
    if (latest.status === "clean") return (
      <span className="inline-flex items-center gap-1 rounded bg-green-500/10 px-2 py-0.5 text-xs font-bold text-green-400">
        <ShieldCheck className="h-3 w-3" /> Safe
      </span>
    );
    if (latest.status === "infected") return (
      <span className="inline-flex items-center gap-1 rounded bg-red-500/10 px-2 py-0.5 text-xs font-bold text-red-500 animate-pulse">
        <ShieldAlert className="h-3 w-3" /> Infected
      </span>
    );
    if (latest.status === "pending") return (
      <span className="inline-flex items-center gap-1 rounded bg-blue-500/10 px-2 py-0.5 text-xs font-bold text-blue-400">
        <RefreshCw className="h-3 w-3 animate-spin" /> Scanning
      </span>
    );
    return (
      <span className="inline-flex items-center gap-1 rounded bg-gray-500/10 px-2 py-0.5 text-xs font-bold text-gray-400">
        Error
      </span>
    );
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Collect unique tags to display filtering tags list
  const allTags = Array.from(new Set(assets.flatMap(a => a.tags)));

  return (
    <div className="flex flex-col space-y-6 h-full min-h-0">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-default/20 pb-5">
        <div>
          <h2 className="text-2xl font-black text-[var(--text)] tracking-tighter">Organization File Vault</h2>
          <p className="text-xs text-muted font-semibold tracking-wider uppercase mt-1">
            Standardized multi-tenant asset registry with background virus scanning
          </p>
        </div>
        
        {/* Upload Action */}
        <div className="flex items-center gap-3">
          <label className={`cursor-pointer inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white bg-[var(--pri)] hover:bg-[var(--pri)]/80 transition-all ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
            <Upload className="h-4 w-4" />
            {uploading ? "Uploading..." : "Upload File"}
            <input 
              type="file" 
              className="hidden" 
              multiple 
              onChange={handleFileUpload} 
              disabled={uploading}
            />
          </label>
          <button 
            onClick={fetchAssets}
            className="p-2.5 rounded-xl border border-default/30 bg-card hover:bg-card-hover text-muted hover:text-text transition-all"
            title="Refresh assets list"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Filter and Search Panel */}
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input 
            type="text" 
            placeholder="Search files by name..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-default/30 bg-card/40 backdrop-blur focus:outline-none focus:border-[var(--pri)] text-sm"
          />
        </div>
        {/* Tags filters */}
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <button
            onClick={() => setSelectedTag(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${selectedTag === null ? 'bg-[var(--pri)]/10 text-[var(--pri)] border border-[var(--pri)]/30' : 'bg-card/40 border border-default/20 text-muted'}`}
          >
            All Files
          </button>
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${selectedTag === tag ? 'bg-[var(--pri)]/10 text-[var(--pri)] border border-[var(--pri)]/30' : 'bg-card/40 border border-default/20 text-muted'}`}
            >
              #{tag}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Vault table + Details sidebar drawer */}
      <div className="flex-1 flex gap-6 min-h-0">
        {/* Files list */}
        <div className="flex-1 border border-default/30 bg-card/10 rounded-2xl overflow-hidden flex flex-col backdrop-blur-md">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <RefreshCw className="h-8 w-8 text-[var(--pri)] animate-spin" />
            </div>
          ) : assets.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted">
              <FileText className="h-12 w-12 text-muted/40 mb-3" />
              <p className="text-sm font-bold">No assets found</p>
              <p className="text-xs text-muted/60 mt-1">Upload a file or modify your filter parameters</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-default/20 text-[10px] uppercase tracking-wider text-muted font-black">
                    <th className="py-3.5 px-6">Name</th>
                    <th className="py-3.5 px-6">Type</th>
                    <th className="py-3.5 px-6">Size</th>
                    <th className="py-3.5 px-6">Scan Status</th>
                    <th className="py-3.5 px-6">Uploaded At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-default/10 text-sm">
                  {assets.map((asset) => (
                    <tr 
                      key={asset.id} 
                      onClick={() => setSelectedAsset(asset)}
                      className={`hover:bg-card/30 cursor-pointer transition-all ${selectedAsset?.id === asset.id ? 'bg-[var(--pri)]/5 border-l-2 border-l-[var(--pri)]' : ''}`}
                    >
                      <td className="py-4 px-6 font-bold text-[var(--text)]">
                        <div className="flex items-center gap-3">
                          <FileText className="h-4 w-4 text-[var(--pri)]" />
                          <span className="truncate max-w-[240px]">{asset.name}</span>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-muted font-medium">{asset.mime_type}</td>
                      <td className="py-4 px-6 text-muted font-medium">{formatBytes(asset.file_size_bytes)}</td>
                      <td className="py-4 px-6">{getScanBadge(asset.virus_scans)}</td>
                      <td className="py-4 px-6 text-muted font-medium">
                        {new Date(asset.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sidebar Drawer */}
        {selectedAsset && (
          <div className="w-80 border border-default/30 bg-card/25 rounded-2xl p-6 flex flex-col space-y-6 backdrop-blur-lg animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between border-b border-default/20 pb-3">
              <h3 className="font-black text-sm tracking-wider uppercase text-[var(--text)]">File Properties</h3>
              <button 
                onClick={() => setSelectedAsset(null)}
                className="text-muted hover:text-text transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-[10px] uppercase font-black text-muted tracking-wider">File Name</p>
                <p className="text-sm font-bold text-[var(--text)] mt-1 truncate">{selectedAsset.name}</p>
              </div>

              <div>
                <p className="text-[10px] uppercase font-black text-muted tracking-wider">Storage Path</p>
                <p className="text-xs font-semibold text-muted/80 mt-1 break-all bg-card/40 p-2 rounded-lg">{selectedAsset.file_path}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] uppercase font-black text-muted tracking-wider">File Size</p>
                  <p className="text-sm font-bold text-[var(--text)] mt-1">{formatBytes(selectedAsset.file_size_bytes)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-black text-muted tracking-wider">Virus Scan</p>
                  <div className="mt-1">{getScanBadge(selectedAsset.virus_scans)}</div>
                </div>
              </div>

              <div>
                <p className="text-[10px] uppercase font-black text-muted tracking-wider">Scan Report</p>
                <p className="text-xs font-medium text-muted mt-1 italic bg-card/40 p-2.5 rounded-lg border border-default/10">
                  {selectedAsset.virus_scans && selectedAsset.virus_scans[0]?.scan_result || "No report available."}
                </p>
              </div>

              {/* Tag Editor */}
              <div>
                <p className="text-[10px] uppercase font-black text-muted tracking-wider mb-2">Associated Tags</p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {selectedAsset.tags && selectedAsset.tags.length > 0 ? (
                    selectedAsset.tags.map(tag => (
                      <span 
                        key={tag}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--pri)]/10 px-2 py-1 text-xs font-bold text-[var(--pri)]"
                      >
                        #{tag}
                        <button 
                          onClick={() => handleRemoveTag(selectedAsset.id, tag)}
                          className="hover:text-red-500 transition-all font-black"
                          title="Remove tag"
                        >
                          ×
                        </button>
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-muted/60 italic font-semibold">No tags added yet.</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="tag1, tag2..."
                    value={newTagsText}
                    onChange={(e) => setNewTagsText(e.target.value)}
                    className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-default/30 bg-card/40 focus:outline-none focus:border-[var(--pri)]"
                  />
                  <button
                    onClick={() => handleAddTags(selectedAsset.id)}
                    className="p-1.5 rounded-lg bg-[var(--pri)] hover:bg-[var(--pri)]/80 text-white text-xs font-bold"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            {/* Actions panel */}
            <div className="border-t border-default/20 pt-4 flex gap-2">
              <a 
                href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/files/${selectedAsset.id}/download`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-default/30 bg-card hover:bg-card-hover px-4 py-2.5 text-xs font-black uppercase tracking-wider text-text transition-all"
              >
                <Download className="h-4 w-4 text-muted" /> Download
              </a>
              <button
                onClick={() => handleDeleteAsset(selectedAsset.id)}
                className="p-2.5 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-all"
                title="Delete asset"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
