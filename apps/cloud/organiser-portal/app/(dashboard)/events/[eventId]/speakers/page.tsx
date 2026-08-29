import { redirect } from "next/navigation";

export default async function EventSpeakersPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  redirect(`/events/${eventId}/speakers/dashboard`);
}
