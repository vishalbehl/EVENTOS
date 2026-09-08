"use client";

import React, { useState, useEffect } from "react";
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

  const token = typeof window !== "undefined" ? (localStorage.getItem("eventos_original_token") || localStorage.getItem("eventos_token") || "") : "";

  const fetchWorkflows = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/v1/workflows`,
        { headers: { "Authorization": `Bearer ${token}` } }
      );
      if (response.ok) {
        const data = await response.json();
        setWorkflows(data);
        
        // Auto-select first workflow to fetch instances
        if (data.length > 0) {
          await fetchInstances(data[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to load workflows:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchInstances = async (workflowId: string) => {
    // We simulate listing instances for simplicity, or we can fetch detailed status
    // Since there isn't a direct list_instances endpoint on router, we can query details of instances if we have their IDs,
    // or simulate an active tracking session. Let's write a mock instance generator if no active instances exist in DB, 
    // or trigger one and load it.
    // In our backend router we have: GET /workflows/instances/{instance_id}.
    // Let's check: if we trigger a workflow, it returns an instance, which we can track. Let's keep a history of triggered instances in state!
    const saved = localStorage.getItem(`eventos_wf_instances_${eventId}`);
    let instanceIds: string[] = saved ? JSON.parse(saved) : [];
    
    const fetched: WorkflowInstance[] = [];
    for (const id of instanceIds) {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/v1/workflows/instances/${id}`,
          { headers: { "Authorization": `Bearer ${token}` } }
        );
        if (res.ok) {
          const inst = await res.json();
          fetched.push(inst);
        }
      } catch (e) {
        console.error("Failed to fetch instance details:", id, e);
      }
    }
    setInstances(fetched);
    
    // Default select first loaded instance
    if (fetched.length > 0 && !selectedInstance) {
      setSelectedInstance(fetched[0]);
    }
  };

  useEffect(() => {
    if (token) {
      fetchWorkflows();
    }
  }, [eventId]);

  const handleTriggerWorkflow = async (workflowId: string) => {
    setTriggering(true);
    try {
      const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/v1/workflows/${workflowId}/trigger`,
        {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}` }
        }
      );
      if (response.ok) {
        const newInst = await response.json();
        
        // Save instance ID locally to keep track of triggered instances
        const saved = localStorage.getItem(`eventos_wf_instances_${eventId}`);
        const list = saved ? JSON.parse(saved) : [];
        list.unshift(newInst.id);
        localStorage.setItem(`eventos_wf_instances_${eventId}`, JSON.stringify(list));
        
        // Reload details
        await fetchInstances(workflowId);
        setSelectedInstance(newInst);
      }
    } catch (err) {
      console.error("Failed to trigger workflow:", err);
    } finally {
      setTriggering(false);
    }
  };

  const handleCompleteTask = async (taskId: string, instanceId: string) => {
    try {
      const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/v1/workflows/tasks/${taskId}/complete`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ comment: commentText })
        }
      );
      if (response.ok) {
        setCommentText("");
        // Reload instance state
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/v1/workflows/instances/${instanceId}`,
          { headers: { "Authorization": `Bearer ${token}` } }
        );
        if (res.ok) {
          const updated = await res.json();
          setSelectedInstance(updated);
          
          // Update instances list
          setInstances(prev => prev.map(inst => inst.id === instanceId ? updated : inst));
        }
      }
    } catch (err) {
      console.error("Failed to approve manual step:", err);
    }
  };

  // Seed default demo workflows if list is empty
  const handleSeedDemoWorkflow = async () => {
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

      const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/v1/workflows`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify(demoWf)
        }
      );
      if (response.ok) {
        await fetchWorkflows();
      }
    } catch (e) {
      console.error("Failed to seed workflow:", e);
    }
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
              disabled={triggering}
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-black uppercase tracking-wider text-[var(--primary-contrast)] bg-[var(--pri)] hover:bg-[var(--pri)]/80 transition-all disabled:opacity-50"
            >
              <Play className="h-4 w-4 fill-white" />
              {triggering ? "Running..." : "Trigger Workflow"}
            </button>
          )}
          {workflows.length === 0 && (
            <button
              onClick={handleSeedDemoWorkflow}
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
                      placeholder="Add an optional review decision comment..."
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      className="flex-1 text-xs px-3.5 py-2.5 rounded-xl border border-default/30 bg-card focus:outline-none focus:border-amber-400"
                    />
                    <button
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
