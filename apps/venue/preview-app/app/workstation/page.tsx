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

  useEffect(() => {
    const loadContext = async () => {
      try {
        const context = await apiClient.get<any>(`/api/v1/srr/stations/${stationNumber}/context`);
        setEventName(context.event?.name || null);
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
    const sendHeartbeat = async () => {
      try {
        const system = typeof window !== "undefined" ? await (window as any).srrDesktop?.getSystemInfo?.() : null;
        await apiClient.post("/api/v1/srr/stations/heartbeat", {
          station_number: stationNumber,
          device_name: system?.hostname || `SRR-WS-0${stationNumber}`,
          ip_address: system?.ipv4,
          status: currentStep === 1 ? "idle" : currentStep === 3 ? "previewing" : "occupied",
        });
      } catch (err: any) {
        setStationHasError(true);
        setStationStatusMessage(err.message || "Heartbeat failed. Check Venue Server reachability and station enrollment.");
      }
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 10000);
    return () => clearInterval(interval);
  }, [stationNumber, currentStep]);

  return (
    <WorkstationLayout>
      <div className="flex flex-col h-[calc(100vh-80px)] overflow-hidden">
        {/* Main Workstation Router */}
        <div className="flex-1 overflow-y-auto no-scrollbar">
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
