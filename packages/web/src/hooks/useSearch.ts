import { useInfiniteQuery } from "@tanstack/react-query";
import { apiFetch } from "@ephemera/shared";
import type { SearchResponse, SearchQuery } from "@ephemera/shared";

export const useSearch = (params: Omit<SearchQuery, "page">) => {
  return useInfiniteQuery({
    queryKey: ["search", params],
    queryFn: async ({ pageParam = 1 }) => {
      const query = new URLSearchParams();
      query.append("q", params.q);
      query.append("page", String(pageParam));

      if (params.sort) query.append("sort", params.sort);
      if (params.content)
        params.content.forEach((c) => query.append("content", c));
      if (params.ext) params.ext.forEach((e) => query.append("ext", e));
      if (params.acc) params.acc.forEach((a) => query.append("acc", a));
      if (params.src) params.src.forEach((s) => query.append("src", s));
      if (params.lang) params.lang.forEach((l) => query.append("lang", l));
      if (params.desc !== undefined) query.append("desc", String(params.desc));

      return apiFetch<SearchResponse>(`/search?${query.toString()}`, {
        timeout: 30000, // 30 second timeout
      });
    },
    getNextPageParam: (lastPage) => {
      return lastPage.pagination.has_next
        ? lastPage.pagination.page + 1
        : undefined;
    },
    initialPageParam: 1,
    enabled: params.q.length > 0,
    retry: 2, // Retry failed requests up to 2 times
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes (formerly cacheTime)
  });
};
