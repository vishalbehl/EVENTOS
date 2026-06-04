import { redirect } from "next/navigation";

export default async function DashboardRedirectPage({ params }: { params: Promise<{ eventId: string }> }) {
  const resolvedParams = await params;
  const eventId = resolvedParams.eventId;

  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
    const response = await fetch(`${apiUrl}/api/v1/events/${eventId}`, {
      next: { revalidate: 0 }
    });
    if (response.ok) {
      const event = await response.json();
      if (!event.speaker_mode_enabled && event.registration_mode_enabled) {
        redirect(`/events/${eventId}/registration`);
      }
    }
  } catch (error) {
    console.error("Failed to fetch event mode details for redirect:", error);
  }

  redirect(`/events/${eventId}/speaker/dashboard`);
}
