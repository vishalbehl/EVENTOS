import { redirect } from "next/navigation";

export default async function EventReportsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  redirect(`/analytics?eventId=${eventId}`);
}
