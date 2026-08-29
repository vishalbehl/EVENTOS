"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import {
  CheckCircle,
  Clock,
  Mail,
  Plus,
  Send,
  UserCheck,
} from "lucide-react";
import {
  DataTable,
  MetricCard,
  OrganiserPage,
  Panel,
  StatusBadge,
} from "@/components/organizer/workspace/OrganiserPrimitives";
import { Button } from "@/components/ui/button";
import { useEvent } from "@/hooks/useEvents";
import { toast } from "sonner";

interface SpeakerInvitation {
  id: string;
  name: string;
  email: string;
  topic: string;
  status: "accepted" | "pending" | "declined";
  sentDate: string;
}

const initialInvitations: SpeakerInvitation[] = [
  { id: "1", name: "Prof. Alan Turing", email: "alan@ai-research.org", topic: "Keynote: Foundation Intelligence", status: "accepted", sentDate: "2026-08-10" },
  { id: "2", name: "Dr. Maya Lin", email: "maya.lin@neurotech.io", topic: "Neural Interfaces in Clinical Trials", status: "pending", sentDate: "2026-08-14" },
  { id: "3", name: "Sir David Attenborough", email: "david@bbcearth.org", topic: "Biodiversity & Global Health", status: "accepted", sentDate: "2026-08-08" },
  { id: "4", name: "Dr. Ken Thompson", email: "ken@unix.bell.org", topic: "Distributed Systems Architecture", status: "pending", sentDate: "2026-08-18" },
  { id: "5", name: "Dr. Fei-Fei Li", email: "feifei@stanford.edu", topic: "Visual Intelligence at Scale", status: "accepted", sentDate: "2026-08-05" },
];

export default function SpeakerInvitationsPage() {
  const params = useParams();
  const eventId = params?.eventId as string;
  const { data: event } = useEvent(eventId);

  const [invitations, setInvitations] = useState<SpeakerInvitation[]>(initialInvitations);

  const total = invitations.length;
  const accepted = invitations.filter((i) => i.status === "accepted").length;
  const pending = invitations.filter((i) => i.status === "pending").length;

  const handleResend = (name: string) => {
    toast.success(`Invitation re-sent to ${name}.`);
  };

  return (
    <OrganiserPage
      title="Speaker Invitations"
      description={event ? `Invite distinguished speakers, keynotes, and track chairs for ${event.name}.` : "Manage speaker invitations and RSVPs."}
      actions={
        <Button size="sm" className="h-8 text-xs font-bold">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Send New Invite
        </Button>
      }
    >
      <div className="op-metric-grid">
        <MetricCard
          label="Total Invited"
          value={total.toString()}
          hint="Speaker invitations"
          tone="purple"
          icon={<Mail className="h-5 w-5" />}
        />
        <MetricCard
          label="Confirmed Accepted"
          value={accepted.toString()}
          hint={`${Math.round((accepted / total) * 100)}% acceptance rate`}
          tone="green"
          icon={<CheckCircle className="h-5 w-5" />}
        />
        <MetricCard
          label="Awaiting RSVP"
          value={pending.toString()}
          hint="Pending follow-up"
          tone="amber"
          icon={<Clock className="h-5 w-5" />}
        />
        <MetricCard
          label="Portal Link"
          value="Active"
          hint="Direct speaker desk"
          tone="teal"
          icon={<UserCheck className="h-5 w-5" />}
        />
      </div>

      <Panel title="Speaker Invitations Roster" className="p-0">
        <DataTable
          columns={["Invited Speaker", "Email Address", "Proposed Session Topic", "Sent Date", "RSVP Status", "Action"]}
          rows={invitations.map((inv) => [
            <span key="name" className="font-bold text-[var(--text-primary)]">{inv.name}</span>,
            <span key="email" className="font-mono text-xs text-[var(--text-secondary)]">{inv.email}</span>,
            <span key="topic" className="text-xs">{inv.topic}</span>,
            <span key="date" className="font-mono text-xs">{inv.sentDate}</span>,
            <StatusBadge key="st" status={inv.status === "accepted" ? "approved" : "pending"} />,
            <Button
              key="act"
              size="sm"
              variant="outline"
              onClick={() => handleResend(inv.name)}
              className="h-7 text-[11px] font-bold"
            >
              <Send className="mr-1.5 h-3 w-3" />
              Resend
            </Button>,
          ])}
        />
      </Panel>
    </OrganiserPage>
  );
}
