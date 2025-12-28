import { Container, Stack, Text, Loader, ThemeIcon } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";

interface MaintenanceBannerProps {
  reason: string | null;
}

/**
 * Full-page maintenance banner shown when FlareSolverr is unavailable
 * and no API key is configured.
 */
export const MaintenanceBanner = ({ reason }: MaintenanceBannerProps) => {
  return (
    <Container size="sm" py="xl">
      <Stack align="center" gap="lg">
        <ThemeIcon size={80} radius="xl" color="yellow" variant="light">
          <IconAlertTriangle size={48} />
        </ThemeIcon>

        <Text size="xl" fw={600} ta="center">
          Service Temporarily Unavailable
        </Text>

        <Text c="dimmed" ta="center" maw={400}>
          {reason ||
            "The download service is temporarily unavailable. Please try again later."}
        </Text>

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
