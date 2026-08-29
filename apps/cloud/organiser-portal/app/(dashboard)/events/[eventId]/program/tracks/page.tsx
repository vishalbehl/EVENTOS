"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import {
  Calendar,
  Layers,
  Plus,
  Tv,
} from "lucide-react";
import {
  DataTable,
  MetricCard,
  OrganiserPage,
  Panel,
} from "@/components/organizer/workspace/OrganiserPrimitives";
import { Button } from "@/components/ui/button";
import { useEvent } from "@/hooks/useEvents";

interface ProgramTrack {
  id: string;
  name: string;
  room: string;
  sessionsCount: number;
  chair: string;
}

const initialTracks: ProgramTrack[] = [
  { id: "1", name: "Track A: Artificial Intelligence & Cloud", room: "Plenary Hall A", sessionsCount: 14, chair: "Dr. Alan Turing" },
  { id: "2", name: "Track B: Biomedical Engineering & Genetics", room: "Auditorium 2", sessionsCount: 10, chair: "Dr. Maya Lin" },
  { id: "3", name: "Track C: Sustainable Energy & Climate Tech", room: "Hall C (West)", sessionsCount: 8, chair: "Dr. Ken Thompson" },
  { id: "4", name: "Track D: Quantum Computing & Security", room: "Executive Hall 1", sessionsCount: 6, chair: "Dr. Fei-Fei Li" },
  { id: "5", name: "Special Workshop Series", room: "Workshop Lab 3", sessionsCount: 4, chair: "Dr. Sarah Jenkins" },
];

export default function ProgramTracksPage() {
  const params = useParams();
  const eventId = params?.eventId as string;
  const { data: event } = useEvent(eventId);

  const [tracks] = useState<ProgramTrack[]>(initialTracks);
  const totalSessions = tracks.reduce((sum, t) => sum + t.sessionsCount, 0);

  return (
    <OrganiserPage
      title="Program Tracks & Themes"
      description={event ? `Define conference tracks, thematic streams, and hall assignments for ${event.name}.` : "Manage program streams and tracks."}
      actions={
        <Button size="sm" className="h-8 text-xs font-bold">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Create New Track
        </Button>
      }
    >
      <div className="op-metric-grid">
        <MetricCard
          label="Conference Tracks"
          value={tracks.length.toString()}
          hint="Parallel streams"
          tone="purple"
          icon={<Layers className="h-5 w-5" />}
        />
        <MetricCard
          label="Scheduled Sessions"
          value={totalSessions.toString()}
          hint="Assigned to tracks"
          tone="green"
          icon={<Calendar className="h-5 w-5" />}
        />
        <MetricCard
          label="Track Stages"
          value="5"
          hint="Dedicated halls & rooms"
          tone="teal"
          icon={<Tv className="h-5 w-5" />}
        />
      </div>

      <Panel title="Program Tracks" className="p-0">
        <DataTable
          columns={["Track Name", "Dedicated Hall / Room", "Sessions Scheduled", "Track Lead / Chair"]}
          rows={tracks.map((track) => [
            <span key="name" className="font-bold text-[var(--text-primary)]">{track.name}</span>,
            <span key="room" className="font-mono text-xs">{track.room}</span>,
            <span key="sessions" className="font-mono text-xs font-bold">{track.sessionsCount} sessions</span>,
            <span key="chair" className="text-xs text-[var(--text-secondary)]">{track.chair}</span>,
          ])}
        />
      </Panel>
    </OrganiserPage>
  );
}
