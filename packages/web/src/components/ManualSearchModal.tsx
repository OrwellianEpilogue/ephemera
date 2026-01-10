import {
  Modal,
  TextInput,
  NumberInput,
  Button,
  Stack,
  Group,
  Text,
  Card,
  Badge,
  Image,
  Box,
  Center,
  Loader,
  ScrollArea,
  Divider,
  ActionIcon,
  Tooltip,
} from "@mantine/core";
import { IconSearch, IconDownload, IconX } from "@tabler/icons-react";
import { useState, useEffect, useMemo } from "react";
import { useDebouncedValue } from "@mantine/hooks";
import { useSearch } from "../hooks/useSearch";
import { useFulfillRequest } from "../hooks/useRequests";
import type { Book, RequestQueryParams } from "@ephemera/shared";

interface ManualSearchModalProps {
  opened: boolean;
  onClose: () => void;
  requestId: number;
  queryParams: RequestQueryParams;
}

const formatFileSize = (bytes?: number): string => {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${mb.toFixed(1)} MB`;
};

interface SearchResultCardProps {
  book: Book;
  onSelect: (md5: string) => void;
  isSelecting: boolean;
}

function SearchResultCard({
  book,
  onSelect,
  isSelecting,
}: SearchResultCardProps) {
  return (
    <Card withBorder padding="sm">
      <Group align="flex-start" wrap="nowrap" gap="md">
        {book.coverUrl && (
          <Box style={{ flexShrink: 0 }}>
            <Image
              src={book.coverUrl}
              alt={book.title}
              w={60}
              h={90}
              radius="sm"
              fallbackSrc="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='90' viewBox='0 0 60 90'%3E%3Crect fill='%23e0e0e0' width='60' height='90'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23999' font-size='8'%3ENo Cover%3C/text%3E%3C/svg%3E"
            />
          </Box>
        )}

        <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
          <Text fw={500} size="sm" lineClamp={2}>
            {book.title}
          </Text>

          {book.authors && book.authors.length > 0 && (
            <Text size="xs" c="dimmed" lineClamp={1}>
              {book.authors.join(", ")}
            </Text>
          )}

          <Group gap="xs">
            {book.format && (
              <Badge size="xs" variant="light" color="blue">
                {book.format}
              </Badge>
            )}
            {book.size && (
              <Badge size="xs" variant="light" color="gray">
                {formatFileSize(book.size)}
              </Badge>
            )}
            {book.year && (
              <Badge size="xs" variant="light" color="gray">
                {book.year}
              </Badge>
            )}
            {book.language && (
              <Badge size="xs" variant="light" color="teal">
                {book.language.toUpperCase()}
              </Badge>
            )}
          </Group>

          <Button
            size="xs"
            leftSection={<IconDownload size={14} />}
            onClick={() => onSelect(book.md5)}
            loading={isSelecting}
            color="green"
          >
            Select & Download
          </Button>
        </Stack>
      </Group>
    </Card>
  );
}

export function ManualSearchModal({
  opened,
  onClose,
  requestId,
  queryParams,
}: ManualSearchModalProps) {
  // Search fields state - initialized from queryParams (year excluded by default for broader results)
  const [searchQuery, setSearchQuery] = useState(queryParams.q || "");
  const [authorQuery, setAuthorQuery] = useState(queryParams.author || "");
  const [titleQuery, setTitleQuery] = useState(queryParams.title || "");
  const [yearQuery, setYearQuery] = useState<number | undefined>(undefined);

  // Reset fields when modal opens with new queryParams
  useEffect(() => {
    if (opened) {
      setSearchQuery(queryParams.q || "");
      setAuthorQuery(queryParams.author || "");
      setTitleQuery(queryParams.title || "");
      // Don't include year by default - it often causes no results
      setYearQuery(undefined);
    }
  }, [opened, queryParams]);

  // Check if we have valid search terms
  const hasSearchTerms = !!(searchQuery || authorQuery || titleQuery);

  // Debounce search params to avoid too many requests while typing
  const searchParamsRaw = useMemo(
    () =>
      hasSearchTerms
        ? {
            q: searchQuery || undefined,
            author: authorQuery || undefined,
            title: titleQuery || undefined,
            year: yearQuery,
          }
        : null,
    [searchQuery, authorQuery, titleQuery, yearQuery, hasSearchTerms],
  );

  const [debouncedParams] = useDebouncedValue(searchParamsRaw, 500);

  // Use empty params when no search terms (disables the query)
  const searchParams = debouncedParams || { q: "" };

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useSearch(searchParams);

  const fulfillRequest = useFulfillRequest();
  const [selectingMd5, setSelectingMd5] = useState<string | null>(null);

  const handleSelect = (bookMd5: string) => {
    setSelectingMd5(bookMd5);
    fulfillRequest.mutate(
      { id: requestId, bookMd5 },
      {
        onSuccess: () => {
          setSelectingMd5(null);
          onClose();
        },
        onError: () => {
          setSelectingMd5(null);
        },
      },
    );
  };

  // Flatten all pages of results
  const allResults = data?.pages.flatMap((page) => page.results) || [];
  const isSearching = isLoading && hasSearchTerms;
  const hasResults = allResults.length > 0;
  const showNoResults = hasSearchTerms && !isLoading && !hasResults;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Manual Search"
      size="lg"
      centered
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Search for a book to fulfill this request. Results update as you type.
        </Text>

        <Divider />

        {/* Search fields */}
        <Stack gap="xs">
          <TextInput
            label="General search"
            placeholder="Search query..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
            rightSection={
              searchQuery && (
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  onClick={() => setSearchQuery("")}
                >
                  <IconX size={14} />
                </ActionIcon>
              )
            }
          />

          <Group grow align="flex-start">
            <TextInput
              label="Author"
              placeholder="Author name"
              value={authorQuery}
              onChange={(e) => setAuthorQuery(e.currentTarget.value)}
              rightSection={
                authorQuery && (
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    onClick={() => setAuthorQuery("")}
                  >
                    <IconX size={14} />
                  </ActionIcon>
                )
              }
            />
            <TextInput
              label="Title"
              placeholder="Book title"
              value={titleQuery}
              onChange={(e) => setTitleQuery(e.currentTarget.value)}
              rightSection={
                titleQuery && (
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    onClick={() => setTitleQuery("")}
                  >
                    <IconX size={14} />
                  </ActionIcon>
                )
              }
            />
            <Tooltip
              label="Optional - adding year may reduce results"
              position="top"
            >
              <NumberInput
                label={
                  <Group gap={4}>
                    <span>Year</span>
                    {queryParams.year && !yearQuery && (
                      <Badge
                        size="xs"
                        variant="light"
                        style={{ cursor: "pointer" }}
                        onClick={() => setYearQuery(queryParams.year)}
                      >
                        +{queryParams.year}
                      </Badge>
                    )}
                  </Group>
                }
                placeholder="optional"
                value={yearQuery}
                onChange={(val) =>
                  setYearQuery(typeof val === "number" ? val : undefined)
                }
                min={1800}
                max={new Date().getFullYear() + 1}
                style={{ width: 120 }}
                rightSection={
                  yearQuery && (
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      onClick={() => setYearQuery(undefined)}
                    >
                      <IconX size={14} />
                    </ActionIcon>
                  )
                }
              />
            </Tooltip>
          </Group>
        </Stack>

        <Divider />

        {/* Search results */}
        {isSearching ? (
          <Center p="xl">
            <Loader size="md" />
          </Center>
        ) : showNoResults ? (
          <Center p="xl">
            <Stack align="center" gap="xs">
              <IconSearch size={32} opacity={0.3} />
              <Text c="dimmed">No results found</Text>
              <Text size="xs" c="dimmed">
                Try different search terms or remove filters
              </Text>
            </Stack>
          </Center>
        ) : hasResults ? (
          <ScrollArea.Autosize mah={400}>
            <Stack gap="sm">
              {allResults.map((book) => (
                <SearchResultCard
                  key={book.md5}
                  book={book}
                  onSelect={handleSelect}
                  isSelecting={selectingMd5 === book.md5}
                />
              ))}

              {hasNextPage && (
                <Button
                  variant="subtle"
                  onClick={() => fetchNextPage()}
                  loading={isFetchingNextPage}
                >
                  Load more results
                </Button>
              )}
            </Stack>
          </ScrollArea.Autosize>
        ) : (
          <Center p="md">
            <Text size="sm" c="dimmed">
              Enter search terms to find books
            </Text>
          </Center>
        )}
      </Stack>
    </Modal>
  );
}
