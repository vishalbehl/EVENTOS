import VenueOpsSectionPage from "@/components/organizer/venue-ops/VenueOpsSectionPage";

export default async function VenueOpsQuotesPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <VenueOpsSectionPage eventId={eventId} section="quotes" />;
}
