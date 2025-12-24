import { useState, useEffect, useRef, useMemo } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import {
  Container,
  Title,
  TextInput,
  Select,
  MultiSelect,
  Grid,
  Stack,
  Button,
  Group,
  Loader,
  Text,
  Center,
  Paper,
  Checkbox,
  Accordion,
} from "@mantine/core";
import { IconSearch, IconFilter, IconBookmark } from "@tabler/icons-react";
import { useSearch } from "../hooks/useSearch";
import { BookCard } from "../components/BookCard";
import type { SearchQuery, SavedRequestWithBook } from "@ephemera/shared";
import {
  SORT_OPTIONS,
  FILE_FORMATS,
  CONTENT_TYPES,
  LANGUAGES,
  apiFetch,
} from "@ephemera/shared";
import { useCreateRequest } from "../hooks/useRequests";

// URL search params schema
type SearchParams = {
  q?: string;
  author?: string;
  title?: string;
  sort?: string;
  content?: string[];
  ext?: string[];
  lang?: string[];
  desc?: boolean;
};

function SearchPage() {
  const navigate = useNavigate();
  const urlParams = Route.useSearch();

  // Local input state for typing (before submitting)
  const [searchInput, setSearchInput] = useState(urlParams.q || "");
  const [authorInput, setAuthorInput] = useState(urlParams.author || "");
  const [titleInput, setTitleInput] = useState(urlParams.title || "");
  const [existingRequestId, setExistingRequestId] = useState<number | null>(
    null,
  );

  const observerTarget = useRef<HTMLDivElement>(null);

  // Use the custom hook for creating requests
  const createRequest = useCreateRequest();

  const handleSaveRequest = () => {
    // Build the query params object to save
    // Ensure we have at least one search term
    if (!urlParams.q && !urlParams.author && !urlParams.title) return;

    const requestParams = {
      q: urlParams.q || "",
      author: urlParams.author,
      title: urlParams.title,
      sort: urlParams.sort,
      content: urlParams.content,
      ext: urlParams.ext,
      lang: urlParams.lang,
      desc: urlParams.desc,
    };
    createRequest.mutate(requestParams);
  };

  // Build query params from URL - memoized to prevent infinite re-renders
  // Use JSON.stringify for array dependencies to compare values, not references
  const queryParams: Omit<SearchQuery, "page"> = useMemo(
    () => ({
      q: urlParams.q || "",
      author: urlParams.author,
      title: urlParams.title,
      sort: (urlParams.sort as "relevant" | "newest" | "oldest") || "relevant",
      content:
        urlParams.content && urlParams.content.length > 0
          ? urlParams.content
          : undefined,
      ext:
        urlParams.ext && urlParams.ext.length > 0 ? urlParams.ext : undefined,
      lang:
        urlParams.lang && urlParams.lang.length > 0
          ? urlParams.lang
          : undefined,
      desc: urlParams.desc || undefined,
    }),
    [
      urlParams.q,
      urlParams.author,
      urlParams.title,
      urlParams.sort,
      JSON.stringify(urlParams.content),
      JSON.stringify(urlParams.ext),
      JSON.stringify(urlParams.lang),
      urlParams.desc,
    ],
  );

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
  } = useSearch(queryParams);

  // Store latest values in refs to avoid recreating observer
  const hasNextPageRef = useRef(hasNextPage);
  const isFetchingNextPageRef = useRef(isFetchingNextPage);
  const fetchNextPageRef = useRef(fetchNextPage);

  // Update refs when values change
  useEffect(() => {
    hasNextPageRef.current = hasNextPage;
    isFetchingNextPageRef.current = isFetchingNextPage;
    fetchNextPageRef.current = fetchNextPage;
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Sync input with URL when navigating back
  useEffect(() => {
    setSearchInput(urlParams.q || "");
    setAuthorInput(urlParams.author || "");
    setTitleInput(urlParams.title || "");
  }, [urlParams.q, urlParams.author, urlParams.title]);

  // Update URL params and save to localStorage
  const updateSearchParams = (updates: Partial<SearchParams>) => {
    const newParams = { ...urlParams, ...updates };
    navigate({
      to: "/search",
      search: newParams,
    });

    // Save to localStorage for persistence
    if (newParams.q || newParams.author || newParams.title) {
      localStorage.setItem("lastSearch", JSON.stringify(newParams));
    }
  };

  // Default filters when no localStorage exists
  const defaultFilters: Partial<SearchParams> = {
    ext: ["epub"],
    lang: ["en", "de"],
  };

  // Restore from localStorage when navigating to /search with no params
  const hasRestoredRef = useRef(false);
  useEffect(() => {
    // Reset the restored flag when we have params (so we can restore again later)
    if (urlParams.q || urlParams.author || urlParams.title) {
      hasRestoredRef.current = false;
    }

    // Check if we have any actual params (not just undefined values)
    const hasAnyParams = Object.values(urlParams).some((val) => {
      if (Array.isArray(val)) return val.length > 0;
      return val !== undefined && val !== null && val !== "";
    });

    // Only restore if we're on the search page with no query params at all
    // and we haven't already restored recently
    if (!hasAnyParams && !hasRestoredRef.current) {
      hasRestoredRef.current = true;

      try {
        const saved = localStorage.getItem("lastSearch");
        if (saved) {
          const savedParams = JSON.parse(saved);
          // Only navigate if saved params actually has a query
          if (savedParams.q || savedParams.author || savedParams.title) {
            navigate({
              to: "/search",
              search: savedParams,
              replace: true, // Replace so back button works correctly
            });
          } else {
            // Has saved params but no query - apply default filters
            navigate({
              to: "/search",
              search: defaultFilters,
              replace: true,
            });
          }
        } else {
          // No saved params - apply default filters
          navigate({
            to: "/search",
            search: defaultFilters,
            replace: true,
          });
        }
      } catch (_e) {
        // On parse error, apply default filters
        navigate({
          to: "/search",
          search: defaultFilters,
          replace: true,
        });
      }
    }
  }, [urlParams, navigate]); // Run when URL params change

  const handleSearch = () => {
    updateSearchParams({
      q: searchInput,
      author: authorInput,
      title: titleInput,
    });
  };

  const handleClearFilters = () => {
    setSearchInput("");
    setAuthorInput("");
    setTitleInput("");
    navigate({
      to: "/search",
      search: {
        sort: "relevant",
        ext: ["epub"],
        lang: ["en", "de"],
      },
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const allBooks = data?.pages.flatMap((page) => page.results) ?? [];
  const totalResults = data?.pages[0]?.pagination.estimated_total_results;

  // Check for existing active request with same params
  useEffect(() => {
    const checkForExistingRequest = async () => {
      if (
        (!urlParams.q && !urlParams.author && !urlParams.title) ||
        allBooks.length > 0
      ) {
        // Only check when we have a query and no results
        setExistingRequestId(null);
        return;
      }

      try {
        const activeRequests = await apiFetch<SavedRequestWithBook[]>(
          "/requests?status=active",
        );

        // Helper to normalize and compare query params
        // Handles both SearchQuery (with optional sort union) and RequestQueryParams (with optional string)
        const normalizeParams = (
          params:
            | Partial<SearchQuery>
            | {
                q?: string;
                author?: string;
                title?: string;
                sort?: string;
                content?: string | string[];
                ext?: string | string[];
                lang?: string | string[];
                desc?: boolean;
              },
        ) => {
          // Normalize arrays from string | string[] to string[]
          const normalizeArray = (
            val: string | string[] | undefined,
          ): string[] => {
            if (!val) return [];
            return Array.isArray(val) ? val : [val];
          };

          return JSON.stringify({
            q: params.q || "",
            author: params.author || undefined,
            title: params.title || undefined,
            sort: params.sort || "relevant",
            content: normalizeArray(
              params.content as string | string[] | undefined,
            ),
            ext: normalizeArray(params.ext as string | string[] | undefined),
            lang: normalizeArray(params.lang as string | string[] | undefined),
            desc: params.desc || false,
          });
        };

        const currentParamsNormalized = normalizeParams(urlParams);
        const matchingRequest = activeRequests?.find((request) => {
          const requestParamsNormalized = normalizeParams(request.queryParams);
          return currentParamsNormalized === requestParamsNormalized;
        });

        setExistingRequestId(matchingRequest?.id || null);
      } catch (error) {
        console.error("Failed to check for existing requests:", error);
        setExistingRequestId(null);
      }
    };

    checkForExistingRequest();
  }, [
    urlParams.q,
    urlParams.author,
    urlParams.title,
    urlParams.sort,
    JSON.stringify(urlParams.content),
    JSON.stringify(urlParams.ext),
    JSON.stringify(urlParams.lang),
    urlParams.desc,
    allBooks.length,
  ]);

  // Infinite scroll observer - using refs to avoid recreating observer on every state change
  // Must create observer AFTER results exist, so target div is rendered
  useEffect(() => {
    // Only set up observer if we have results to show
    if (allBooks.length === 0) {
      return;
    }

    const currentTarget = observerTarget.current;
    if (!currentTarget) {
      console.warn(
        "[IntersectionObserver] No target element found! Waiting for results to render...",
      );
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const isIntersecting = entries[0]?.isIntersecting;
        const hasNext = hasNextPageRef.current;
        const isFetching = isFetchingNextPageRef.current;

        // Use refs to get latest values without recreating the observer
        if (isIntersecting && hasNext && !isFetching) {
          fetchNextPageRef.current();
        }
      },
      {
        threshold: 0.1,
        rootMargin: "0px 0px 1200px 0px", // Trigger 800px before reaching the bottom
      },
    );

    observer.observe(currentTarget);

    return () => {
      observer.unobserve(currentTarget);
      observer.disconnect();
    };
    // Create observer when query changes OR when results first load (allBooks becomes non-empty)
    // Use urlParams.q as key to force recreation on new search
  }, [urlParams.q, urlParams.author, urlParams.title, allBooks.length]);

  return (
    <Container size="xl">
      <Stack gap="lg">
        <Title order={1}>Search Books</Title>

        {/* Search Bar */}
        <Paper p="md" withBorder>
          <Stack gap="md">
            <Group gap="sm" wrap="nowrap">
              <TextInput
                placeholder="Search for books, authors, ISBN..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={handleKeyPress}
                leftSection={<IconSearch size={16} />}
                size="md"
                style={{ flex: 1 }}
              />
              <Button
                onClick={handleSearch}
                disabled={!searchInput && !authorInput && !titleInput}
                size="md"
              >
                Search
              </Button>
            </Group>

            {/* Filters in Accordion */}
            <Accordion>
              <Accordion.Item value="filters">
                <Accordion.Control icon={<IconFilter size={16} />}>
                  Filter Options
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="md">
                    <Grid gutter="md">
                      <Grid.Col span={6}>
                        <TextInput
                          label="Author"
                          placeholder="Author name"
                          value={authorInput}
                          onChange={(e) => setAuthorInput(e.target.value)}
                          onKeyDown={handleKeyPress}
                        />
                      </Grid.Col>
                      <Grid.Col span={6}>
                        <TextInput
                          label="Title"
                          placeholder="Book title"
                          value={titleInput}
                          onChange={(e) => setTitleInput(e.target.value)}
                          onKeyDown={handleKeyPress}
                        />
                      </Grid.Col>
                      <Grid.Col span={6}>
                        <Select
                          label="Sort by"
                          placeholder="Most relevant"
                          value={urlParams.sort || "relevant"}
                          onChange={(value) =>
                            updateSearchParams({ sort: value || "relevant" })
                          }
                          data={SORT_OPTIONS.map((opt) => opt)}
                        />
                      </Grid.Col>

                      <Grid.Col span={6}>
                        <MultiSelect
                          label="File Format"
                          placeholder="Any format"
                          value={urlParams.ext || []}
                          onChange={(value) =>
                            updateSearchParams({ ext: value })
                          }
                          data={FILE_FORMATS.map((fmt) => fmt)}
                          searchable
                          clearable
                        />
                      </Grid.Col>

                      <Grid.Col span={6}>
                        <MultiSelect
                          label="Language"
                          placeholder="Any language"
                          value={urlParams.lang || []}
                          onChange={(value) =>
                            updateSearchParams({ lang: value })
                          }
                          data={LANGUAGES.map((lang) => lang)}
                          searchable
                          clearable
                        />
                      </Grid.Col>

                      <Grid.Col span={6}>
                        <MultiSelect
                          label="Content Type"
                          placeholder="Any type"
                          value={urlParams.content || []}
                          onChange={(value) =>
                            updateSearchParams({ content: value })
                          }
                          data={CONTENT_TYPES.map((type) => type)}
                          searchable
                          clearable
                        />
                      </Grid.Col>
                    </Grid>

                    <Checkbox
                      label="Search in descriptions and metadata"
                      checked={urlParams.desc || false}
                      onChange={(e) =>
                        updateSearchParams({ desc: e.currentTarget.checked })
                      }
                    />
                    <Button
                      variant="subtle"
                      color="red"
                      onClick={handleClearFilters}
                      fullWidth
                    >
                      Reset all filters
                    </Button>
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          </Stack>
        </Paper>

        {/* Results */}
        {isLoading && (
          <Center p="xl">
            <Loader size="lg" />
          </Center>
        )}

        {isError && (
          <Center p="xl">
            <Text c="red">Error loading results. Please try again.</Text>
          </Center>
        )}

        {!isLoading &&
          !isError &&
          (urlParams.q || urlParams.author || urlParams.title) && (
            <>
              {allBooks.length > 0 ? (
                <>
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">
                      Found {totalResults ? `${totalResults}+` : "many"} results
                      {urlParams.q && ` for "${urlParams.q}"`}
                      {urlParams.author && ` by ${urlParams.author}`}
                      {urlParams.title && ` titled "${urlParams.title}"`}
                    </Text>
                    <Text size="sm" c="dimmed">
                      Showing {allBooks.length} books
                    </Text>
                  </Group>

                  <Grid gutter="md">
                    {allBooks.map((book, index) => (
                      <Grid.Col
                        key={`${book.md5}-${index}`}
                        span={{ base: 12, xs: 6, sm: 4, md: 3 }}
                      >
                        <BookCard book={book} />
                      </Grid.Col>
                    ))}
                  </Grid>

                  {/* Infinite scroll trigger */}
                  <div ref={observerTarget} style={{ height: "20px" }}>
                    {isFetchingNextPage && (
                      <Center>
                        <Loader size="sm" />
                      </Center>
                    )}
                    {error && !isFetchingNextPage && hasNextPage && (
                      <Center p="md">
                        <Stack gap="xs" align="center">
                          <Text size="sm" c="red">
                            Failed to load more results
                          </Text>
                          <Button
                            size="xs"
                            variant="light"
                            onClick={() => fetchNextPageRef.current()}
                          >
                            Retry
                          </Button>
                        </Stack>
                      </Center>
                    )}
                  </div>

                  {!hasNextPage && allBooks.length > 0 && (
                    <Center p="md">
                      <Text size="sm" c="dimmed">
                        No more results
                      </Text>
                    </Center>
                  )}
                </>
              ) : (
                <Center p="xl">
                  <Stack align="center" gap="md">
                    <IconFilter size={48} opacity={0.3} />
                    <Text c="dimmed">
                      No results found
                      {urlParams.q && ` for "${urlParams.q}"`}
                      {urlParams.author && ` by ${urlParams.author}`}
                      {urlParams.title && ` titled "${urlParams.title}"`}
                    </Text>
                    <Text size="sm" c="dimmed">
                      Try adjusting your filters or search terms
                    </Text>
                    {existingRequestId ? (
                      <>
                        <Text size="sm" c="dimmed">
                          You already have an active request for this search
                        </Text>
                        <Button
                          component={Link}
                          to="/requests"
                          leftSection={<IconBookmark size={16} />}
                          variant="light"
                        >
                          View your requests
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          leftSection={<IconBookmark size={16} />}
                          variant="light"
                          onClick={handleSaveRequest}
                          loading={createRequest.isPending}
                        >
                          Save this search as a request
                        </Button>
                        <Text
                          size="xs"
                          c="dimmed"
                          style={{ maxWidth: "400px", textAlign: "center" }}
                        >
                          Ephemera will automatically check for new results and
                          download the book when it becomes available
                        </Text>
                      </>
                    )}
                  </Stack>
                </Center>
              )}
            </>
          )}

        {!urlParams.q &&
          !urlParams.author &&
          !urlParams.title &&
          !isLoading && (
            <Center p="xl">
              <Stack align="center" gap="sm">
                <IconSearch size={48} opacity={0.3} />
                <Text c="dimmed">Enter a search term to get started</Text>
              </Stack>
            </Center>
          )}
      </Stack>
    </Container>
  );
}

export const Route = createFileRoute("/search")({
  component: SearchPage,
  validateSearch: (search: Record<string, unknown>): SearchParams => {
    // Helper to parse arrays from URL
    const toArray = (val: unknown): string[] | undefined => {
      if (!val) return undefined;
      if (Array.isArray(val)) return val as string[];
      if (typeof val === "string") return [val];
      return undefined;
    };

    return {
      q: typeof search.q === "string" ? search.q : undefined,
      author: typeof search.author === "string" ? search.author : undefined,
      title: typeof search.title === "string" ? search.title : undefined,
      sort: typeof search.sort === "string" ? search.sort : undefined,
      content: toArray(search.content),
      ext: toArray(search.ext),
      lang: toArray(search.lang),
      desc:
        typeof search.desc === "boolean"
          ? search.desc
          : search.desc === "true"
            ? true
            : search.desc === "false"
              ? false
              : undefined,
    };
  },
});
