import { redirect } from "next/navigation";

export default async function EventAbstractsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  redirect(`/events/${eventId}/speakers/abstracts`);
}
