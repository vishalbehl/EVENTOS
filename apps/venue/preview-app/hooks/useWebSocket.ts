"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";
import { useAuthStore } from "@/store/use-auth-store";
import { useSRRStore } from "@/store/use-srr-store";

const WS_URL = process.env.NEXT_PUBLIC_VENUE_WS_URL || "http://127.0.0.1:8001";

export function useWebSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { mode, stationNumber } = useAuthStore();
  const { setSpeaker, setSessions, setCurrentStep } = useSRRStore();

  useEffect(() => {
    const socket = io(WS_URL, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      const eventId = process.env.NEXT_PUBLIC_VENUE_EVENT_ID;
      if (eventId) socket.emit("join_event_room", { event_id: eventId });
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    // Listen for speaker assignment on our specific workstation
    socket.on("srr:speaker_assigned", (data: any) => {
      if (mode === "workstation" && data.station_number === stationNumber) {
        toast.success(`Assigned: Welcome ${data.speaker_name}!`);
        if (data.speaker) {
          setSpeaker(data.speaker);
        }
        if (data.sessions) {
          setSessions(data.sessions);
        }
        setCurrentStep(2); // Go directly to Step 2 Setup
      }
    });

    socket.on("srr:station_reset", (data: any) => {
      if (mode === "workstation" && data.station_number === stationNumber) {
        toast.info("Workstation was reset to idle");
        setCurrentStep(1);
      }
    });

    socket.on("srr:station_locked", (data: any) => {
      if (mode === "workstation" && data.station_number === stationNumber) {
        if (data.locked) {
          toast.warning("Workstation locked by technician");
        } else {
          toast.success("Workstation unlocked");
        }
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [mode, stationNumber, setCurrentStep, setSessions, setSpeaker]);

  return { isConnected, socket: socketRef.current };
}
