import { redirect } from "next/navigation";

export default async function RegistrationPage({ params }: { params: Promise<{ eventId: string }> | { eventId: string } }) {
  const resolvedParams = await params;
  redirect(`/events/${resolvedParams.eventId}/registration/dashboard`);
}
