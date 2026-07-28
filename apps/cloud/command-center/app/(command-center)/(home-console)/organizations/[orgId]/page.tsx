import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ orgId: string }>;
}

export default async function OrgConsolePage({ params }: Props) {
  const unwrappedParams = await params;
  redirect(`/organizations/${unwrappedParams.orgId}/overview`);
}
