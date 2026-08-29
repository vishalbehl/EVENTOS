import { redirect } from "next/navigation";

export default async function EventPaymentsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  redirect(`/events/${eventId}/registration/financials`);
}
