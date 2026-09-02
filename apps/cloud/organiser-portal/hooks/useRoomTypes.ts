import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";

export interface RoomTypeCatalogItem {
  id: string;
  name: string;
  code: string;
  description?: string;
  is_system: boolean;
  is_active: boolean;
}

export function useRoomTypes() {
  return useQuery({
    queryKey: ["agenda-catalogs", "room-types"],
    queryFn: async () => {
      const res = await apiGet<RoomTypeCatalogItem[]>("/agenda-catalogs/room-types");
      return res || [];
    },
    staleTime: 10 * 60 * 1000,
  });
}
