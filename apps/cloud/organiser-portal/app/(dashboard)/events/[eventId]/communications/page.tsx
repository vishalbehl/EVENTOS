import { redirect } from "next/navigation";

export default async function EventCommunicationsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  redirect(`/events/${eventId}/communications/dashboard`);
}
