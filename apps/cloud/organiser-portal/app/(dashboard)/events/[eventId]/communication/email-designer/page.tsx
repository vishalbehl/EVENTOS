import { redirect } from "next/navigation";

export default async function LegacyEmailDesignerRedirect({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  redirect(`/events/${eventId}/design-studio/emails`);
}
