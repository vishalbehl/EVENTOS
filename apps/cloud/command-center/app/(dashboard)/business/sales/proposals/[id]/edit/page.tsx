"use client"

import { useParams } from "next/navigation"
import ProposalForm from "@/components/proposals/ProposalForm"

export default function EditProposalPage() {
  const params = useParams()
  const id = params.id as string

  return <ProposalForm proposalId={id} />
}
