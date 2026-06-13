import { redirect } from "next/navigation";

export default async function SpeakerWorkspacePage({ params }: { params: Promise<{ eventId: string }> }) {
  const resolvedParams = await params;
  redirect(`/events/${resolvedParams.eventId}/speaker/dashboard`);
}
