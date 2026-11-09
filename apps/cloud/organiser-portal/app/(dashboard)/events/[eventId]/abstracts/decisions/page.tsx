import { redirect } from "next/navigation";

export default async function AbstractDecisionsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  redirect(`/events/${eventId}/abstracts/submissions`);
}
