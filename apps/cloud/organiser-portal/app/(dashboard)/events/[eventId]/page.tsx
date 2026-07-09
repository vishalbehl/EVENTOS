import { redirect } from "next/navigation";

export default async function EventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const resolvedParams = await params;
  const eventId = resolvedParams.eventId;

  redirect(`/events/${eventId}/dashboard`);
}
