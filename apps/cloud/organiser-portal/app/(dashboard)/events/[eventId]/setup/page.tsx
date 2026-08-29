import { redirect } from "next/navigation";

export default async function EventSetupPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  redirect(`/events/${eventId}/planning/details`);
}
