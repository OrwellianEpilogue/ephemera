import {
  Container,
  Stack,
  Text,
  Loader,
  ThemeIcon,
  List,
  Code,
} from "@mantine/core";
import { IconAlertTriangle, IconWorldOff } from "@tabler/icons-react";

interface MaintenanceBannerProps {
  flareSolverrDown: boolean;
  searcherBlocked: boolean;
  reason: string | null;
}

/**
 * Full-page maintenance banner shown when services are unavailable.
 * Shows different messages for FlareSolverr vs searcher being blocked.
 */
export const MaintenanceBanner = ({
  flareSolverrDown,
  searcherBlocked,
  reason,
}: MaintenanceBannerProps) => {
  // Determine which failure type to display
  const isSearcherIssue = searcherBlocked && !flareSolverrDown;

  const title = isSearcherIssue
    ? "Search Service Blocked"
    : "Service Temporarily Unavailable";

  const Icon = isSearcherIssue ? IconWorldOff : IconAlertTriangle;

  const defaultMessage = flareSolverrDown
    ? "FlareSolverr is unavailable and no API key is configured. Search and downloads are temporarily disabled."
    : searcherBlocked
      ? "The search service appears to be blocked."
      : "The service is temporarily unavailable. Please try again later.";

  return (
    <Container size="sm" py="xl">
      <Stack align="center" gap="lg">
        <ThemeIcon size={80} radius="xl" color="yellow" variant="light">
          <Icon size={48} />
        </ThemeIcon>

        <Text size="xl" fw={600} ta="center">
          {title}
        </Text>

        <Text c="dimmed" ta="center" maw={400}>
          {reason || defaultMessage}
        </Text>

        {/* Show actionable suggestions for searcher blocked */}
        {isSearcherIssue && (
          <Stack gap="xs" maw={450}>
            <Text size="sm" fw={500} ta="center">
              Try one of these solutions:
            </Text>
            <List size="sm" c="dimmed" spacing="xs">
              <List.Item>
                Change your DNS server to Cloudflare (<Code>1.1.1.1</Code>) or
                Google (<Code>8.8.8.8</Code>)
              </List.Item>
              <List.Item>Use a VPN to bypass the network restriction</List.Item>
              <List.Item>
                Check if your network administrator is blocking the site
              </List.Item>
            </List>
          </Stack>
        )}

        <Stack align="center" gap="xs" mt="md">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            Checking for recovery...
          </Text>
        </Stack>
      </Stack>
    </Container>
  );
};
