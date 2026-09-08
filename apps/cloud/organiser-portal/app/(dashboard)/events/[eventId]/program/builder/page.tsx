import { redirect } from "next/navigation";

type ProgramBuilderPageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function ProgramBuilderPage({ params }: ProgramBuilderPageProps) {
  const { eventId } = await params;
  redirect(`/events/${eventId}/sessions/builder`);
}
