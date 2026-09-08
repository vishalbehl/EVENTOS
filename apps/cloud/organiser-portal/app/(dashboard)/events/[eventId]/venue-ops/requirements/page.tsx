import VenueOpsRequirementsWorkspace from "@/components/organizer/venue-ops/VenueOpsRequirementsPage";

export default async function VenueOpsRequirementsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <VenueOpsRequirementsWorkspace eventId={eventId} />;
}
