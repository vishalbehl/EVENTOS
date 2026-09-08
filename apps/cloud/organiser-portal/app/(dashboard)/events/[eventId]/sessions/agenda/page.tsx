import { redirect } from "next/navigation";

type SessionAgendaPageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function SessionAgendaPage({ params }: SessionAgendaPageProps) {
  const { eventId } = await params;
  redirect(`/events/${eventId}/sessions/builder`);
}
