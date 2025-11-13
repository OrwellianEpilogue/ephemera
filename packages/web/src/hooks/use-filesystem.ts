import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@ephemera/shared";

interface DirectoryEntry {
  name: string;
  type: "file" | "directory";
  path: string;
}

interface DirectoryListing {
  currentPath: string;
  parentPath: string | null;
  entries: DirectoryEntry[];
}

export function useDirectoryListing(path: string) {
  return useQuery<DirectoryListing>({
    queryKey: ["filesystem", "list", path],
    queryFn: async () => {
      const params = new URLSearchParams({ path });
      return apiFetch<DirectoryListing>(`/filesystem/list?${params}`);
    },
    staleTime: 30000, // Consider data fresh for 30 seconds
  });
}
