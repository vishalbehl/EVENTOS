import { redirect } from "next/navigation";

export default async function EventSettingsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  redirect(`/events/${eventId}/planning/details?tab=settings`);
}
