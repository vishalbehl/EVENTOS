"use client"

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState"

interface ProposalFormProps {
  proposalId?: string
}

export default function ProposalForm({ proposalId }: ProposalFormProps) {
  return (
    <UnavailableRouteState
      title={proposalId ? "Proposal Editing Locked" : "Create Proposal From An Approved Quote"}
      description={proposalId
        ? "Immutable proposal versions cannot be edited in place. Return to the proposal preview to inspect or generate its persisted version."
        : "Client proposals are created only from a version-bound approved quote. Open the quote approval workspace and complete its approval first."}
      breadcrumb={["Business", "Sales", "Proposals", proposalId ? "Edit" : "Create"]}
      removed={[
        "Client-authored proposal numbers and fabricated default content.",
        "Writes to legacy proposal endpoints that do not own the immutable commercial snapshot.",
        "Local-only theme, section, and status changes presented as saved proposal data.",
      ]}
      required={[
        "Use the approved quote workflow to create proposal version 1.",
        "Create future versions through an explicit audited amendment workflow.",
        "Generate and download documents from the durable proposal preview workspace.",
      ]}
      note="The immutable approved quote snapshot is the proposal source of truth. This route cannot bypass approval or mutate a released version."
    />
  )
}
