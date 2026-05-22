import { redirect } from "next/navigation";

export default async function EventPage({ params }: { params: Promise<{ eventId: string }> | { eventId: string } }) {
  const resolvedParams = await params;
  redirect(`/events/${resolvedParams.eventId}/dashboard`);
}
