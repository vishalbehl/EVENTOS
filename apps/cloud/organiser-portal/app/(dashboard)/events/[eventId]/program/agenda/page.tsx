import { redirect } from "next/navigation";

type MasterAgendaPageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function MasterAgendaPage({ params }: MasterAgendaPageProps) {
  const { eventId } = await params;
  redirect(`/events/${eventId}/sessions/builder`);
}
