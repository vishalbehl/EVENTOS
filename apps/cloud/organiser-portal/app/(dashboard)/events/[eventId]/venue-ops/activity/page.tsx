import VenueOpsSectionPage from "@/components/organizer/venue-ops/VenueOpsSectionPage";

export default async function VenueOpsActivityPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <VenueOpsSectionPage eventId={eventId} section="activity" />;
}
