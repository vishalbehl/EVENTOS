"use client";

import React, { useState, useEffect, useRef } from "react";
import { apiClient, ApiError } from "@/lib/api-client";
import { accessContextCacheKey, useAuthStore } from "@/store/use-auth-store";
import { usePermissions } from "@/hooks/usePermissions";
import { useParams } from "next/navigation";
import { 
  GitBranch, Play, CheckCircle2, Clock, 
  AlertCircle, ArrowRight, UserCheck, MessageSquare, RefreshCw 
} from "lucide-react";

interface WorkflowStep {
  id: string;
  step_name: string;
  step_order: number;
  config: Record<string, any>;
}

interface Workflow {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  steps: WorkflowStep[];
}

interface WorkflowTask {
  id: string;
  status: string;
  version: number;
  step_id: string;
  created_at: string;
  step?: WorkflowStep;
  assignments?: {
    id: string;
    assigned_to: string;
    assigned_at: string;
  }[];
}

interface WorkflowHistory {
  id: string;
  action: string;
  comment: string;
  created_at: string;
}

interface WorkflowInstance {
  id: string;
  workflow_id: string;
  status: string;
  created_at: string;
  workflow?: Workflow;
  tasks: WorkflowTask[];
  history: WorkflowHistory[];
}

export default function WorkflowsPage() {
  const { eventId } = useParams();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [instances, setInstances] = useState<WorkflowInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<WorkflowInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { accessToken: token, activeContext, user, isContextSwitching } = useAuthStore();
  const contextKey = accessContextCacheKey(activeContext, user?.organization_id);
  const { permissions } = usePermissions();
  const canManage = permissions.includes("workflows:manage") && activeContext?.access_mode !== "DELEGATED";
  const canApprove = permissions.includes("workflows:approve") && activeContext?.access_mode !== "DELEGATED";
  const requestScope = useRef(new AbortController());
  const storageKey = `eventos_wf_instances_${user?.id}_${contextKey}_${eventId}`;
  const showError = (problem: unknown) => {
    const issue = problem as ApiError;
    if (!issue.aborted) setError(issue.status === 412
      ? "This task changed. Reload its current state before approving."
      : issue.message || "The operation could not be completed.");
  };

  const fetchWorkflows = async () => {
    const signal = requestScope.current.signal;
    try {
      setLoading(true);
      const data = await apiClient.get<Workflow[]>("/workflows", { signal });
        if (signal.aborted) return;
        setWorkflows(data);
        
        // Auto-select first workflow to fetch instances
        if (data.length > 0) {
          await fetchInstances(data[0].id);
        }
    } catch (err) {
      if (!signal.aborted) showError(err);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  };

  const fetchInstances = async (workflowId: string) => {
    const signal = requestScope.current.signal;
    // Local IDs are hints only; every instance is authorised by the backend.
    const saved = localStorage.getItem(storageKey);
    let instanceIds: string[] = [];
    try {
      const parsed: unknown = saved ? JSON.parse(saved) : [];
      if (Array.isArray(parsed)) instanceIds = parsed.filter((id): id is string =>
        typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)).slice(0, 100);
    } catch { localStorage.removeItem(storageKey); }
    
    const fetched: WorkflowInstance[] = [];
    for (const id of instanceIds) {
      try {
        const inst = await apiClient.get<WorkflowInstance>(`/workflows/instances/${id}`,
          { signal });
        if (signal.aborted) return;
        fetched.push(inst);
      } catch (e) {
        if (signal.aborted) return;
        showError(e);
      }
    }
    if (signal.aborted) return;
    setInstances(fetched);
    
    // Default select first loaded instance
    if (fetched.length > 0 && !selectedInstance) {
      setSelectedInstance(fetched[0]);
    }
  };

  useEffect(() => {
    requestScope.current.abort();
    requestScope.current = new AbortController();
    setWorkflows([]);
    setInstances([]);
    setSelectedInstance(null);
    setCommentText("");
    setError(null);
    setTriggering(false);
    setLoading(false);
    if (token && !isContextSwitching) {
      fetchWorkflows();
    }
    return () => requestScope.current.abort();
  }, [eventId, token, contextKey, isContextSwitching]);

  const handleTriggerWorkflow = async (workflowId: string) => {
    if (triggering || !canManage || isContextSwitching) return;
    setTriggering(true);
    setError(null);
    const signal = requestScope.current.signal;
    try {
        const newInst = await apiClient.post<WorkflowInstance>(`/workflows/${workflowId}/trigger`, undefined,
          { signal });
        if (signal.aborted) return;
        
        // Save instance ID locally to keep track of triggered instances
        const list = instances.map(instance => instance.id);
        list.unshift(newInst.id);
        localStorage.setItem(storageKey, JSON.stringify([...new Set(list)].slice(0, 100)));
        
        // Reload details
        await fetchInstances(workflowId);
        if (signal.aborted) return;
        setSelectedInstance(newInst);
    } catch (err) {
      if (!signal.aborted) showError(err);
    } finally {
      if (!signal.aborted) setTriggering(false);
    }
  };

  const handleCompleteTask = async (taskId: string, instanceId: string) => {
    if (triggering || !canApprove || isContextSwitching) return;
    const task = selectedInstance?.tasks.find(candidate => candidate.id === taskId);
    if (!task || commentText.trim().length < 3) {
      setError("Enter an approval reason of at least three characters.");
      return;
    }
    setTriggering(true);
    setError(null);
    const signal = requestScope.current.signal;
    try {
      await apiClient.post(`/workflows/tasks/${taskId}/complete`, { comment: commentText.trim() },
        { headers: { "If-Match": String(task.version) }, signal });
        if (signal.aborted) return;
        setCommentText("");
        // Reload instance state
          const updated = await apiClient.get<WorkflowInstance>(`/workflows/instances/${instanceId}`,
            { signal });
          if (signal.aborted) return;
          setSelectedInstance(updated);
          
          // Update instances list
          setInstances(prev => prev.map(inst => inst.id === instanceId ? updated : inst));
    } catch (err) {
      if (!signal.aborted) showError(err);
    } finally { if (!signal.aborted) setTriggering(false); }
  };

  // Seed default demo workflows if list is empty
  const handleSeedDemoWorkflow = async () => {
    if (!canManage || triggering || isContextSwitching) return;
    setTriggering(true);
    const signal = requestScope.current.signal;
    try {
      const demoWf = {
        name: "Speaker Registration & Slide Audit",
        description: "Auto-evaluates uploaded files, triggers manual review, and schedules email alerts.",
        steps: [
          { step_name: "Email Notification", step_order: 1, config: { to: "speaker@example.com", template: "welcome" } },
          { step_name: "Manual Review", step_order: 2, config: { assignee_name: "Lead Organizer" } },
          { step_name: "Badge Approval", step_order: 3, config: {} }
        ]
      };

      await apiClient.post("/workflows", demoWf, { signal });
      if (signal.aborted) return;
        await fetchWorkflows();
    } catch (e) {
      if (!signal.aborted) showError(e);
    } finally { if (!signal.aborted) setTriggering(false); }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case "completed":
        return <CheckCircle2 className="h-5 w-5 text-green-400" />;
      case "running":
        return <RefreshCw className="h-5 w-5 text-amber-400 animate-spin" />;
      case "pending":
        return <Clock className="h-5 w-5 text-muted" />;
      case "failed":
        return <AlertCircle className="h-5 w-5 text-red-400 animate-pulse" />;
      default:
        return <Clock className="h-5 w-5 text-muted" />;
    }
  };

  const getStatusClass = (status: string) => {
    switch (status.toLowerCase()) {
      case "completed":
        return "border-green-500/30 bg-green-500/10 shadow-[0_0_15px_rgba(34,197,94,0.15)]";
      case "running":
        return "border-amber-500/30 bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.15)] active-glow";
      case "pending":
        return "border-default/20 bg-card/40 opacity-60";
      case "failed":
        return "border-red-500/30 bg-red-500/10 shadow-[0_0_15px_rgba(239,68,68,0.15)]";
      default:
        return "border-default/20 bg-card/40";
    }
  };

  return (
    <div className="flex flex-col space-y-6 h-full min-h-0">
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-default/20 pb-5">
        <div>
          <h2 className="text-2xl font-black text-[var(--text)] tracking-tighter">Event Automation Engine</h2>
          <p className="text-xs text-muted font-semibold tracking-wider uppercase mt-1">
            Visual workflow steps monitor and automated trigger executor
          </p>
        </div>

        <div className="flex items-center gap-3">
          {workflows.length > 0 && (
            <button 
              onClick={() => handleTriggerWorkflow(workflows[0].id)}
              disabled={triggering || !canManage || isContextSwitching}
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-black uppercase tracking-wider text-[var(--primary-contrast)] bg-[var(--pri)] hover:bg-[var(--pri)]/80 transition-all disabled:opacity-50"
            >
              <Play className="h-4 w-4 fill-white" />
              {triggering ? "Running..." : "Trigger Workflow"}
            </button>
          )}
          {workflows.length === 0 && (
            <button
              onClick={handleSeedDemoWorkflow}
              disabled={triggering || !canManage || isContextSwitching}
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-black uppercase tracking-wider text-[var(--text)] border border-default/30 bg-card hover:bg-card-hover transition-all"
            >
              <GitBranch className="h-4 w-4" /> Initialize Speaker Workflow
            </button>
          )}
        </div>
      </div>

      {/* Main Layout Grid */}
      <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
        {/* Left Side: Workflows List & Instances History */}
        <div className="w-full lg:w-80 flex flex-col space-y-6">
          {/* Workflows List Card */}
          <div className="border border-default/30 bg-card/10 rounded-2xl p-5 backdrop-blur-md">
            <h3 className="font-black text-xs tracking-wider uppercase text-muted mb-4">Workflow Templates</h3>
            {loading ? (
              <p className="text-xs text-muted">Loading templates...</p>
            ) : workflows.length === 0 ? (
              <p className="text-xs text-muted italic">No active workflows defined.</p>
            ) : (
              workflows.map(wf => (
                <div key={wf.id} className="p-3 border border-[var(--pri)]/20 bg-[var(--pri)]/5 rounded-xl">
                  <p className="text-sm font-black text-[var(--text)]">{wf.name}</p>
                  <p className="text-xs text-muted mt-1 leading-relaxed">{wf.description}</p>
                  <div className="flex items-center gap-2 mt-3 text-[10px] font-bold text-[var(--pri)]">
                    <span>{wf.steps.length} Automated Steps</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Instances List Card */}
          <div className="flex-1 border border-default/30 bg-card/10 rounded-2xl p-5 backdrop-blur-md flex flex-col min-h-0">
            <h3 className="font-black text-xs tracking-wider uppercase text-muted mb-4">Execution History</h3>
            {instances.length === 0 ? (
              <p className="text-xs text-muted italic p-4 text-center my-auto">No execution history found. Trigger a template above.</p>
            ) : (
              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-1">
                {instances.map(inst => (
                  <div 
                    key={inst.id}
                    onClick={() => setSelectedInstance(inst)}
                    className={`p-3 rounded-xl border border-default/20 cursor-pointer transition-all hover:bg-card/30 ${selectedInstance?.id === inst.id ? 'bg-[var(--pri)]/5 border-[var(--pri)]/40' : 'bg-card/10'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase text-muted truncate max-w-[120px]">{inst.id}</span>
                      <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${inst.status === 'completed' ? 'bg-green-500/10 text-green-400' : inst.status === 'running' ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'}`}>
                        {inst.status}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted font-bold mt-2">
                      Started: {new Date(inst.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Active Instance Step Visualizer */}
        <div className="flex-1 border border-default/30 bg-card/10 rounded-2xl p-6 flex flex-col backdrop-blur-md min-h-0">
          {selectedInstance ? (
            <div className="flex-1 flex flex-col min-h-0 space-y-6">
              {/* Instance Header Info */}
              <div className="flex items-center justify-between border-b border-default/20 pb-4">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--pri)]">Instance Tracker</span>
                  <h3 className="text-lg font-black text-[var(--text)] tracking-tighter mt-1">{selectedInstance.workflow?.name || "Active Workflow"}</h3>
                  <p className="text-xs text-muted mt-0.5 font-bold">Execution Reference ID: {selectedInstance.id}</p>
                </div>
                <div className={`px-3 py-1 rounded-xl text-xs font-black uppercase tracking-widest border ${selectedInstance.status === 'completed' ? 'border-green-500/30 text-green-400 bg-green-500/10' : 'border-amber-500/30 text-amber-400 bg-amber-500/10'}`}>
                  {selectedInstance.status}
                </div>
              </div>

              {/* Visual Steps Chain */}
              <div className="py-4">
                <h4 className="text-xs font-black uppercase tracking-wider text-muted mb-6">Workflow Step Flow</h4>
                
                <div className="flex flex-col md:flex-row items-center md:items-stretch gap-4 md:gap-3">
                  {selectedInstance.workflow?.steps?.map((step, idx) => {
                    // Match step to task if executed
                    const task = selectedInstance.tasks.find(t => t.step_id === step.id);
                    const taskStatus = task ? task.status : "pending";
                    
                    return (
                      <React.Fragment key={step.id}>
                        {/* Step Card */}
                        <div className={`flex-1 w-full md:w-auto p-4 border rounded-xl flex flex-col justify-between transition-all ${getStatusClass(taskStatus)}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <span className="text-[10px] font-bold text-muted uppercase">Step {step.step_order}</span>
                              <h5 className="font-bold text-sm text-[var(--text)] mt-1">{step.step_name}</h5>
                            </div>
                            <div>{getStatusIcon(taskStatus)}</div>
                          </div>
                          
                          <div className="mt-4">
                            <p className="text-[10px] font-semibold text-muted/80 break-all bg-card/30 p-2 rounded">
                              {step.step_name.toLowerCase() === "email_notification" ? (
                                `Email to ${step.config.to || "speaker"}`
                              ) : step.step_name.toLowerCase() === "manual_review" ? (
                                `Assignee: ${step.config.assignee_name || "Lead Coordinator"}`
                              ) : (
                                "Automated pipeline processing"
                              )}
                            </p>
                          </div>
                        </div>

                        {/* Connection Arrow */}
                        {idx < (selectedInstance.workflow?.steps?.length ?? 0) - 1 && (
                          <div className="hidden md:flex items-center justify-center text-muted">
                            <ArrowRight className="h-5 w-5" />
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>

              {/* Manual task action box */}
              {selectedInstance.tasks.find(t => t.status === "pending" && t.step?.step_name.toLowerCase() === "manual_review") && (
                <div className="p-5 border border-amber-500/30 bg-amber-500/5 rounded-2xl flex flex-col space-y-4 animate-in fade-in duration-300">
                  <div className="flex items-center gap-2 text-amber-400">
                    <UserCheck className="h-5 w-5" />
                    <span className="text-xs font-black uppercase tracking-wider">Awaiting Manual Approval</span>
                  </div>
                  <p className="text-xs text-muted/80 leading-relaxed font-semibold">
                    The workflow is currently blocked at the **Manual Review** step. Please inspect slide files or attendee details, write a brief comment, and approve.
                  </p>
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      placeholder="Enter the approval reason..."
                      maxLength={500}
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      className="flex-1 text-xs px-3.5 py-2.5 rounded-xl border border-default/30 bg-card focus:outline-none focus:border-amber-400"
                    />
                    <button
                      disabled={triggering || !canApprove || isContextSwitching || commentText.trim().length < 3}
                      onClick={() => {
                        const pendingTask = selectedInstance.tasks.find(t => t.status === "pending" && t.step?.step_name.toLowerCase() === "manual_review");
                        if (pendingTask) {
                          handleCompleteTask(pendingTask.id, selectedInstance.id);
                        }
                      }}
                      className="rounded-xl px-5 py-2.5 text-xs font-black uppercase tracking-widest text-white bg-amber-500 hover:bg-amber-600 transition-all"
                    >
                      Approve Step
                    </button>
                  </div>
                </div>
              )}

              {/* Timeline Log History */}
              <div className="flex-1 flex flex-col min-h-0">
                <h4 className="text-xs font-black uppercase tracking-wider text-muted mb-3">Timeline History Logs</h4>
                <div className="flex-1 border border-default/20 bg-card/20 rounded-xl p-4 overflow-y-auto custom-scrollbar space-y-3">
                  {selectedInstance.history?.map(log => (
                    <div key={log.id} className="flex gap-3 text-xs leading-relaxed border-b border-default/10 pb-2.5 last:border-0 last:pb-0">
                      <MessageSquare className="h-4 w-4 text-[var(--pri)] shrink-0 mt-0.5" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[var(--text)] uppercase text-[10px] tracking-wide bg-[var(--pri)]/10 text-[var(--pri)] px-2 py-0.5 rounded">{log.action}</span>
                          <span className="text-[10px] text-muted">{new Date(log.created_at).toLocaleTimeString()}</span>
                        </div>
                        <p className="text-muted/80 mt-1 font-semibold">{log.comment}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted">
              <GitBranch className="h-12 w-12 text-muted/40 mb-3" />
              <p className="text-sm font-bold">No active workflow instance selected</p>
              <p className="text-xs text-muted/60 mt-1">Select an instance from history or trigger a template to visualize the flow</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
