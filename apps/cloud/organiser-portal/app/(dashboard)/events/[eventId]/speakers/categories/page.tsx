"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import {
  Mic,
  Plus,
  Tag,
  Users,
} from "lucide-react";
import {
  DataTable,
  MetricCard,
  OrganiserPage,
  Panel,
} from "@/components/organizer/workspace/OrganiserPrimitives";
import { Button } from "@/components/ui/button";
import { useEvent } from "@/hooks/useEvents";

interface SpeakerCategory {
  id: string;
  name: string;
  badgeTone: string;
  count: number;
  perks: string;
}

const initialSpeakerCategories: SpeakerCategory[] = [
  { id: "1", name: "Keynote Speaker", badgeTone: "purple", count: 4, perks: "VIP Green Room, Honorarium, Flight & Hotel" },
  { id: "2", name: "Invited Panelist", badgeTone: "teal", count: 12, perks: "Speaker Lounge, Complimentary Pass" },
  { id: "3", name: "Session Chair / Moderator", badgeTone: "amber", count: 8, perks: "Stage Briefing, Reserved Seating" },
  { id: "4", name: "Oral Abstract Presenter", badgeTone: "green", count: 35, perks: "Presentation Ready Room Access" },
  { id: "5", name: "Workshop Instructor", badgeTone: "rose", count: 6, perks: "Workshop Hall Setup, TA Support" },
];

export default function SpeakerCategoriesPage() {
  const params = useParams();
  const eventId = params?.eventId as string;
  const { data: event } = useEvent(eventId);

  const [categories] = useState<SpeakerCategory[]>(initialSpeakerCategories);

  const totalSpeakers = categories.reduce((sum, c) => sum + c.count, 0);

  return (
    <OrganiserPage
      title="Speaker Categories & Roles"
      description={event ? `Classify speakers, keynotes, panelists, and moderators for ${event.name}.` : "Speaker categorization and role designations."}
      actions={
        <Button size="sm" className="h-8 text-xs font-bold">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Role Category
        </Button>
      }
    >
      <div className="op-metric-grid">
        <MetricCard
          label="Total Categories"
          value={categories.length.toString()}
          hint="Role designations"
          tone="purple"
          icon={<Tag className="h-5 w-5" />}
        />
        <MetricCard
          label="Total Assigned"
          value={totalSpeakers.toString()}
          hint="Speakers mapped to roles"
          tone="green"
          icon={<Users className="h-5 w-5" />}
        />
        <MetricCard
          label="Keynote Speakers"
          value="4"
          hint="Main plenary speakers"
          tone="teal"
          icon={<Mic className="h-5 w-5" />}
        />
      </div>

      <Panel title="Speaker Role Designations" className="p-0">
        <DataTable
          columns={["Role Name", "Speaker Count", "Privileges & Access"]}
          rows={categories.map((cat) => [
            <span key="name" className="font-bold text-[var(--text-primary)]">{cat.name}</span>,
            <span key="count" className="font-mono text-xs font-bold">{cat.count} speakers</span>,
            <span key="perks" className="text-xs text-[var(--text-secondary)]">{cat.perks}</span>,
          ])}
        />
      </Panel>
    </OrganiserPage>
  );
}
