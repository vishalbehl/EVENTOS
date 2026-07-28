"use client";

import { useParams } from "next/navigation";
import TemplateEditor from "@/components/organizer/emails/templates/TemplateEditor";

export default function EmailDesignerPage() {
  const params = useParams<{ eventId: string }>();
  return <TemplateEditor eventId={String(params.eventId)} />;
}
