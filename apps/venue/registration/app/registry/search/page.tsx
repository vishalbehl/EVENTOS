"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import ParticipantTable from "@/components/ParticipantTable";

export default function SearchParticipantPage() {
  const [participants, setParticipants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchParticipants = async () => {
    try {
      setLoading(true);
      const res: any = await apiClient.get(`/venue/registration/participants?limit=5000`);
      setParticipants(res.items || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchParticipants();
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full overflow-hidden">
      <ParticipantTable
        title="Participant Search & Directory"
        subtitle="Search across all registered delegates, speakers, VIPs, and exhibitors."
        participants={participants}
        loading={loading}
        onRefresh={fetchParticipants}
      />
    </div>
  );
}
