"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  Clock,
  Building2,
  Tag,
  Layers,
  ArrowUp,
  ArrowDown,
  Indent,
  Outdent,
  Eye,
  Trash2,
  Save,
  CheckCircle2,
  SlidersHorizontal,
  Sparkles,
  FileText,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { RoomItem, TrackConfigItem } from "./RoomTrackSetup";

export interface StructureNode {
  id: string;
  code: string; // e.g. "01", "02", "A", "B"
  title: string;
  type: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  roomId?: string;
  trackId?: string;
  color?: string;
  description?: string;
  children?: StructureNode[];
  isExpanded?: boolean;
}

interface AgendaStructureBuilderProps {
  dayTitle: string;
  dayDate: string;
  rooms: RoomItem[];
  tracks: TrackConfigItem[];
  initialNodes: StructureNode[];
  onPreview: () => void;
  onSaveStructure: (nodes: StructureNode[]) => Promise<void> | void;
  onBack: () => void;
}

export function AgendaStructureBuilder({
  dayTitle,
  dayDate,
  rooms,
  tracks,
  initialNodes = [],
  onPreview,
  onSaveStructure,
  onBack,
}: AgendaStructureBuilderProps) {
  const [nodes, setNodes] = useState<StructureNode[]>(initialNodes);
  const [selectedNodeId, setSelectedNodeId] = useState<string>(initialNodes[0]?.id || "");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setNodes(initialNodes);
    if (initialNodes.length > 0 && !initialNodes.some((n) => n.id === selectedNodeId)) {
      setSelectedNodeId(initialNodes[0].id);
    }
  }, [initialNodes]);

  // Find active node (search top-level and children)
  const findNode = (list: StructureNode[], id: string): StructureNode | null => {
    for (const item of list) {
      if (item.id === id) return item;
      if (item.children) {
        const found = findNode(item.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  const selectedNode = findNode(nodes, selectedNodeId) || nodes[0];
  const [formState, setFormState] = useState<StructureNode>(selectedNode);

  const handleSelectNode = (node: StructureNode) => {
    setSelectedNodeId(node.id);
    setFormState({ ...node });
  };

  const handleUpdateActiveNode = (field: keyof StructureNode, value: any) => {
    setFormState((prev) => ({ ...prev, [field]: value }));

    const updateRecursive = (list: StructureNode[]): StructureNode[] => {
      return list.map((item) => {
        if (item.id === formState.id) {
          return { ...item, [field]: value };
        }
        if (item.children) {
          return { ...item, children: updateRecursive(item.children) };
        }
        return item;
      });
    };

    setNodes(updateRecursive(nodes));
  };

  const handleAddSection = () => {
    const newId = `sec-${Date.now()}`;
    const codeNum = String(nodes.length + 1).padStart(2, "0");
    const newNode: StructureNode = {
      id: newId,
      code: codeNum,
      title: `New Section ${nodes.length + 1}`,
      type: "Scientific Session",
      startTime: "15:30",
      endTime: "16:30",
      durationMinutes: 60,
      roomId: rooms[0]?.id || "hall-a",
      trackId: tracks[0]?.id || "track-1",
      color: "#3b82f6",
      description: "",
    };
    setNodes([...nodes, newNode]);
    setSelectedNodeId(newId);
    setFormState(newNode);
    toast.success("Added new section");
  };

  const handleAddSubSection = () => {
    if (!selectedNodeId) return;

    const newSubId = `sub-${Date.now()}`;
    const newSubNode: StructureNode = {
      id: newSubId,
      code: "A",
      title: "New Presentation / Talk",
      type: "Scientific Session",
      startTime: formState.startTime,
      endTime: formState.endTime,
      durationMinutes: 20,
      roomId: formState.roomId,
    };

    const addSubRecursive = (list: StructureNode[]): StructureNode[] => {
      return list.map((item) => {
        if (item.id === selectedNodeId) {
          const nextChildren = item.children ? [...item.children, newSubNode] : [newSubNode];
          return { ...item, isExpanded: true, children: nextChildren };
        }
        if (item.children) {
          return { ...item, children: addSubRecursive(item.children) };
        }
        return item;
      });
    };

    setNodes(addSubRecursive(nodes));
    setSelectedNodeId(newSubId);
    setFormState(newSubNode);
    toast.success("Added sub-section talk");
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSaveStructure(nodes);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex size-8 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-[var(--text-primary)]">
                {dayTitle} - Structure Builder
              </h1>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Published
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Hierarchical section outline, presentation order, and timing structure.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPreview}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors cursor-pointer shadow-xs"
          >
            <Eye className="size-3.5 text-[var(--text-secondary)]" /> Preview Agenda
          </button>

          <button
            type="button"
            onClick={handleAddSection}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--pri)] px-4 py-2 text-xs font-bold text-[var(--primary-contrast)] shadow-sm hover:opacity-95 transition-opacity cursor-pointer"
          >
            <Plus className="size-3.5" /> + Add Section
          </button>
        </div>
      </div>

      {/* Tree Toolbar Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={handleAddSection}
            className="flex items-center gap-1 rounded-md border border-[var(--border-default)] bg-[var(--card)] px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] cursor-pointer"
          >
            <Plus className="size-3" /> Section
          </button>
          <button
            type="button"
            onClick={handleAddSubSection}
            className="flex items-center gap-1 rounded-md border border-[var(--border-default)] bg-[var(--card)] px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] cursor-pointer"
          >
            <Plus className="size-3" /> Sub-section
          </button>
          <div className="h-4 w-px bg-[var(--border-default)] mx-1" />
          <button
            type="button"
            onClick={() => toast.info("Indented sub-level")}
            className="flex items-center gap-1 rounded-md border border-[var(--border-default)] bg-[var(--card)] px-2 py-1 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] cursor-pointer"
          >
            <Indent className="size-3.5" /> Indent
          </button>
          <button
            type="button"
            onClick={() => toast.info("Un-indented level")}
            className="flex items-center gap-1 rounded-md border border-[var(--border-default)] bg-[var(--card)] px-2 py-1 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] cursor-pointer"
          >
            <Outdent className="size-3.5" /> Unindent
          </button>
          <button
            type="button"
            onClick={() => toast.info("Moved section up")}
            className="flex items-center gap-1 rounded-md border border-[var(--border-default)] bg-[var(--card)] px-2 py-1 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] cursor-pointer"
          >
            <ArrowUp className="size-3.5" /> Up
          </button>
          <button
            type="button"
            onClick={() => toast.info("Moved section down")}
            className="flex items-center gap-1 rounded-md border border-[var(--border-default)] bg-[var(--card)] px-2 py-1 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] cursor-pointer"
          >
            <ArrowDown className="size-3.5" /> Down
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            const allExpanded = nodes.every((n) => n.isExpanded);
            setNodes(nodes.map((n) => ({ ...n, isExpanded: !allExpanded })));
          }}
          className="text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
        >
          Collapse / Expand All
        </button>
      </div>

      {/* Main Split Layout: Left Hierarchical Tree Outline | Right Section Details Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Tree Outline (7 cols) */}
        <div className="lg:col-span-7 space-y-2 rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-4 shadow-xs max-h-[700px] overflow-y-auto">
          {nodes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border-default)] p-12 text-center">
              <Layers className="mx-auto size-10 text-[var(--text-tertiary)]" />
              <h3 className="mt-3 text-sm font-bold text-[var(--text-primary)]">
                No Agenda Sections Yet
              </h3>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Create structured blocks, keynote sessions, and oral presentation tracks for this day.
              </p>
              <button
                type="button"
                onClick={handleAddSection}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[var(--pri)] px-4 py-2 text-xs font-bold text-[var(--primary-contrast)] shadow-sm hover:brightness-110 cursor-pointer"
              >
                <Plus className="size-3.5" />
                <span>Add First Section</span>
              </button>
            </div>
          ) : (
            nodes.map((node) => {
            const isSelected = node.id === selectedNodeId;
            const hasChildren = Boolean(node.children && node.children.length > 0);

            return (
              <div key={node.id} className="space-y-1.5">
                {/* Parent Row */}
                <div
                  onClick={() => handleSelectNode(node)}
                  className={cn(
                    "flex items-center justify-between rounded-lg border p-2.5 text-xs transition-all cursor-pointer",
                    isSelected
                      ? "border-[var(--pri)] bg-[var(--pri)]/10 shadow-xs"
                      : "border-[var(--border-default)] bg-[var(--surface-subtle)] hover:bg-[var(--card)]"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="font-mono text-[11px] font-bold text-[var(--pri)] w-5 shrink-0">
                      {node.code}
                    </span>
                    <span
                      className="size-2 rounded-full shrink-0"
                      style={{ backgroundColor: node.color || "#3b82f6" }}
                    />
                    <span className="font-bold text-[var(--text-primary)] truncate">
                      {node.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] font-mono text-[var(--text-secondary)] shrink-0 ml-2">
                    <span>
                      {node.startTime} - {node.endTime}
                    </span>
                    {hasChildren && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setNodes(
                            nodes.map((n) =>
                              n.id === node.id ? { ...n, isExpanded: !n.isExpanded } : n
                            )
                          );
                        }}
                        className="p-1 hover:bg-[var(--bg-surface-hover)] rounded cursor-pointer"
                      >
                        {node.isExpanded ? (
                          <ChevronDown className="size-3.5" />
                        ) : (
                          <ChevronRight className="size-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Sub-items (Children) */}
                {hasChildren && node.isExpanded && (
                  <div className="pl-6 space-y-1.5 border-l-2 border-[var(--border-default)] ml-3">
                    {node.children!.map((sub) => {
                      const isSubSelected = sub.id === selectedNodeId;
                      return (
                        <div
                          key={sub.id}
                          onClick={() => handleSelectNode(sub)}
                          className={cn(
                            "flex items-center justify-between rounded-md border p-2 text-xs transition-all cursor-pointer",
                            isSubSelected
                              ? "border-[var(--pri)] bg-[var(--pri)]/10"
                              : "border-[var(--border-default)] bg-[var(--card)] hover:bg-[var(--surface-subtle)]"
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono text-[10px] font-bold text-[var(--text-tertiary)] w-4 shrink-0">
                              {sub.code}.
                            </span>
                            <span className="text-[var(--text-primary)] truncate font-medium">
                              {sub.title}
                            </span>
                          </div>

                          <span className="font-mono text-[10px] text-[var(--text-secondary)] shrink-0 ml-2">
                            {sub.startTime} - {sub.endTime} ({sub.durationMinutes}m)
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }))}
        </div>

        {/* Right Section Details Inspector (5 cols) */}
        <div className="lg:col-span-5 space-y-4 rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-5 shadow-xs">
          {!formState ? (
            <div className="flex h-64 flex-col items-center justify-center p-6 text-center">
              <FileText className="size-8 text-[var(--text-tertiary)]" />
              <h4 className="mt-2 text-xs font-bold text-[var(--text-primary)]">No Section Selected</h4>
              <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                Add a new section or select one from the tree to edit its timing, room, and track.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  Section Details
                </h3>
                <span className="font-mono text-xs font-bold text-[var(--pri)]">
                  ID: {formState.code}
                </span>
              </div>

              <div className="space-y-3.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                    Title *
                  </label>
                  <input
                    value={formState.title}
                    onChange={(e) => handleUpdateActiveNode("title", e.target.value)}
                    placeholder="Section or talk title"
                    className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                  />
                </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                  Type
                </label>
                <select
                  value={formState.type}
                  onChange={(e) => handleUpdateActiveNode("type", e.target.value)}
                  className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none cursor-pointer"
                >
                  <option value="Scientific Session">Scientific Session</option>
                  <option value="Keynote">Keynote</option>
                  <option value="Panel">Panel Discussion</option>
                  <option value="Workshop">Workshop</option>
                  <option value="Ceremony">Ceremony</option>
                  <option value="Break">Break</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                  Assigned Room
                </label>
                <select
                  value={formState.roomId || ""}
                  onChange={(e) => handleUpdateActiveNode("roomId", e.target.value)}
                  className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none cursor-pointer"
                >
                  <option value="">No specific room</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                  Start Time
                </label>
                <input
                  type="time"
                  value={formState.startTime}
                  onChange={(e) => handleUpdateActiveNode("startTime", e.target.value)}
                  className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                  End Time
                </label>
                <input
                  type="time"
                  value={formState.endTime}
                  onChange={(e) => handleUpdateActiveNode("endTime", e.target.value)}
                  className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                  Duration (min)
                </label>
                <input
                  type="number"
                  min={5}
                  value={formState.durationMinutes}
                  onChange={(e) =>
                    handleUpdateActiveNode("durationMinutes", parseInt(e.target.value) || 0)
                  }
                  className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                Conference Track
              </label>
              <select
                value={formState.trackId || ""}
                onChange={(e) => handleUpdateActiveNode("trackId", e.target.value)}
                className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none cursor-pointer"
              >
                <option value="">General Track</option>
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                Description
              </label>
              <textarea
                rows={3}
                value={formState.description || ""}
                onChange={(e) => handleUpdateActiveNode("description", e.target.value)}
                placeholder="Overview of topics and objectives covered in this section."
                className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--pri)] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-4">
            <button
              type="button"
              onClick={() => {
                setNodes(nodes.filter((n) => n.id !== formState.id));
                toast.success("Section removed");
              }}
              className="text-xs font-semibold text-rose-500 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="size-3.5" /> Delete
            </button>

            <button
              type="button"
              disabled={isSaving}
              onClick={handleSave}
              className={cn(
                "flex items-center gap-1.5 rounded-lg bg-[var(--pri)] px-5 py-2 text-xs font-bold text-[var(--primary-contrast)] shadow-sm transition-opacity",
                isSaving ? "opacity-75 cursor-not-allowed" : "hover:opacity-95 cursor-pointer"
              )}
            >
              {isSaving ? (
                <>
                  <RefreshCw className="size-3.5 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <Save className="size-3.5" /> Save Changes
                </>
              )}
            </button>
          </div>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
