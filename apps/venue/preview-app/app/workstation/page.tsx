"use client";

import { useState, useEffect } from "react";
import { WorkstationLayout } from "@/components/workstation/WorkstationLayout";
import { IdleStandbyView } from "@/components/workstation/IdleStandbyView";
import { SetupStep } from "@/components/workstation/SetupStep";
import { PreviewStep } from "@/components/workstation/PreviewStep";
import { FinalizeModal } from "@/components/workstation/FinalizeModal";
import { ReuploadModal } from "@/components/workstation/ReuploadModal";
import { useSRRStore } from "@/store/use-srr-store";
import { useAuthStore } from "@/store/use-auth-store";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

export default function WorkstationPage() {
  const { currentStep, setCurrentStep, setSpeaker, setSessions, selectSession } = useSRRStore();
  const { stationNumber } = useAuthStore();

  const [isFinalizeOpen, setIsFinalizeOpen] = useState(false);
  const [isReuploadOpen, setIsReuploadOpen] = useState(false);
  const [eventName, setEventName] = useState<string | null>(null);
  const [stationStatusMessage, setStationStatusMessage] = useState<string | null>(null);
  const [stationHasError, setStationHasError] = useState(false);
  const [serverSequence, setServerSequence] = useState<number | null>(null);
  const [cacheStatus, setCacheStatus] = useState<{ freeBytes: number; minimumFreeBytes: number; sufficient: boolean; cachedFiles: number; verifiedFiles?: number; attentionFiles?: number; runtimeEvents?: number; serverSequence?: number; lastRuntimeSyncAt?: string | null; pendingMutations?: number; conflicts?: number } | null>(null);

  useEffect(() => {
    const loadContext = async () => {
      if (stationNumber == null) {
        setSpeaker(null);
        setSessions([]);
        setCurrentStep(1);
        setStationHasError(true);
        setStationStatusMessage("This workstation has not been assigned a station number.");
        return;
      }
      try {
        const context = await apiClient.get<any>(`/api/v1/srr/stations/${stationNumber}/context`);
        setEventName(context.event?.name || null);
        setServerSequence(typeof context.server_sequence === "number" ? context.server_sequence : null);
        setStationStatusMessage(null);
        setStationHasError(false);
        setSpeaker(context.speaker || null);
        setSessions(context.sessions || []);
        if (context.speaker) {
          setCurrentStep(2);
          if (context.sessions?.length) selectSession(0);
        } else {
          setCurrentStep(1);
        }
      } catch (err: any) {
        setSpeaker(null);
        setSessions([]);
        setCurrentStep(1);
        setStationHasError(true);
        setStationStatusMessage(err.message || "This workstation is offline or not configured on Venue Server.");
      }
    };

    void loadContext();
    const interval = setInterval(loadContext, 15000);
    return () => clearInterval(interval);
  }, [stationNumber, setCurrentStep, setSpeaker, setSessions, selectSession]);

  useEffect(() => {
    const loadCacheStatus = async () => {
      try {
        const status = await (window as any).srrDesktop?.getCacheStatus?.();
        if (status) setCacheStatus(status);
      } catch {
        setCacheStatus(null);
      }
    };
    void loadCacheStatus();
    const interval = setInterval(loadCacheStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const sendHeartbeat = async () => {
      if (stationNumber == null) return;
      try {
        const system = typeof window !== "undefined" ? await (window as any).srrDesktop?.getSystemInfo?.() : null;
        await apiClient.post("/api/v1/srr/stations/heartbeat", {
          station_number: stationNumber,
          device_name: system?.hostname || `SRR-WS-0${stationNumber}`,
          hostname: system?.hostname,
          app_version: process.env.NEXT_PUBLIC_APP_VERSION || undefined,
          ip_address: system?.ipv4,
          status: currentStep === 1 ? "idle" : currentStep === 3 ? "previewing" : "occupied",
          last_server_sequence: serverSequence,
        });
      } catch (err: any) {
        setStationHasError(true);
        setStationStatusMessage(err.message || "Heartbeat failed. Check Venue Server reachability and station enrollment.");
      }
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 10000);
    return () => clearInterval(interval);
  }, [stationNumber, currentStep, serverSequence]);

  return (
    <WorkstationLayout>
      <div className="flex flex-col h-[calc(100vh-80px)] overflow-hidden">
        {/* Main Workstation Router */}
        <div className="flex-1 overflow-y-auto no-scrollbar">
          {cacheStatus && !cacheStatus.sufficient && (
            <div className="mx-6 mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              Local presentation storage is low ({Math.round(cacheStatus.freeBytes / 1024 / 1024)} MB free). New files may be blocked until space is available.
            </div>
          )}
          {cacheStatus && (
            <div className="mx-6 mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-[var(--muted)]">
              Local sync: {cacheStatus.verifiedFiles ?? 0} verified files · {cacheStatus.pendingMutations ?? 0} pending changes · {cacheStatus.conflicts ?? 0} conflicts · server cursor {cacheStatus.serverSequence ?? 0}
              {cacheStatus.lastRuntimeSyncAt ? ` · last event sync ${new Date(cacheStatus.lastRuntimeSyncAt).toLocaleTimeString()}` : " · runtime events not synchronized"}
            </div>
          )}
          {currentStep === 1 && (
            <IdleStandbyView
              eventName={eventName}
              statusMessage={stationStatusMessage}
              isError={stationHasError}
              onStartSession={() => toast.info(stationStatusMessage || "Waiting for speaker assignment from intake or admin console.")}
            />
          )}
          {currentStep === 2 && (
            <SetupStep onOpenReupload={() => setIsReuploadOpen(true)} onFinalize={() => setIsFinalizeOpen(true)} />
          )}
          {currentStep === 3 && (
            <PreviewStep onFinalize={() => setIsFinalizeOpen(true)} />
          )}
        </div>

        {/* Modals */}
        <FinalizeModal
          open={isFinalizeOpen}
          onClose={() => setIsFinalizeOpen(false)}
        />
        <ReuploadModal
          open={isReuploadOpen}
          onClose={() => setIsReuploadOpen(false)}
        />
      </div>
    </WorkstationLayout>
  );
}
