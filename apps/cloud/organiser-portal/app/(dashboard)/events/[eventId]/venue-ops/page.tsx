import { redirect } from "next/navigation";

export default async function EventVenueOpsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  redirect(`/events/${eventId}/program/rooms`);
}
