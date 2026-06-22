import { redirect } from "next/navigation";

export default async function TechnologyServicesIndex({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  redirect(`/events/${eventId}/technology-services/dashboard`);
}
