import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import {
  AppShell,
  Burger,
  Group,
  NavLink,
  Title,
  ActionIcon,
  useMantineColorScheme,
  useComputedColorScheme,
  Badge,
  Stack,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconSearch,
  IconDownload,
  IconSettings,
  IconSun,
  IconMoon,
  IconBookmark,
  IconBook,
  IconExternalLink,
} from "@tabler/icons-react";
import { useQueue } from "../hooks/useQueue";
import { useRequestStats } from "../hooks/useRequests";
import { useAppSettings } from "../hooks/useSettings";
import { VersionFooter } from "../components/VersionFooter";

function RootComponent() {
  const [opened, { toggle }] = useDisclosure();
  const { setColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme("light", {
    getInitialValueInEffect: true,
  });
  // Establish SSE connection at root level (stays alive throughout session)
  const { data: queue } = useQueue({ notifyOnComplete: true, enableSSE: true });

  const toggleColorScheme = () => {
    setColorScheme(computedColorScheme === "light" ? "dark" : "light");
  };

  // Fetch request stats for badge
  const { data: requestStats } = useRequestStats();

  // Fetch app settings for library link
  const { data: settings } = useAppSettings();

  // Calculate queue badge counts
  const queueingCount = queue ? Object.keys(queue.queued).length : 0;
  const downloadingCount = queue ? Object.keys(queue.downloading).length : 0;
  const delayedCount = queue ? Object.keys(queue.delayed).length : 0;
  const totalActiveCount = queueingCount + downloadingCount + delayedCount;

  // Get fulfilled requests count for badge
  const fulfilledCount = requestStats?.fulfilled || 0;

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 300,
        breakpoint: "sm",
        collapsed: { mobile: !opened },
      }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
            />
            <Title order={3}>Ephemera</Title>
          </Group>
          <Group gap="xs">
            {settings?.libraryUrl &&
              (settings.libraryLinkLocation === "header" ||
                settings.libraryLinkLocation === "both") && (
                <ActionIcon
                  component="a"
                  href={settings.libraryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="subtle"
                  aria-label="Library"
                >
                  <IconBook size={20} />
                </ActionIcon>
              )}
            <ActionIcon
              variant="subtle"
              onClick={toggleColorScheme}
              aria-label="Toggle color scheme"
            >
              {computedColorScheme === "light" ? (
                <IconMoon size={20} />
              ) : (
                <IconSun size={20} />
              )}
            </ActionIcon>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <Stack h="100%" gap={0} style={{ overflow: "hidden" }}>
          <NavLink
            component={Link}
            to="/search"
            label="Search"
            leftSection={<IconSearch size={20} />}
            onClick={() => toggle()}
          />
          <NavLink
            component={Link}
            to="/queue"
            label="Queue"
            leftSection={<IconDownload size={20} />}
            rightSection={
              totalActiveCount > 0 ? (
                <Badge size="sm" variant="filled" color="blue" circle>
                  {totalActiveCount}
                </Badge>
              ) : null
            }
            onClick={() => toggle()}
          />
          <NavLink
            component={Link}
            to="/requests"
            label="Requests"
            leftSection={<IconBookmark size={20} />}
            rightSection={
              fulfilledCount > 0 ? (
                <Badge size="sm" variant="filled" color="green" circle>
                  {fulfilledCount}
                </Badge>
              ) : null
            }
            onClick={() => toggle()}
          />
          {settings?.libraryUrl &&
            (settings.libraryLinkLocation === "sidebar" ||
              settings.libraryLinkLocation === "both") && (
              <NavLink
                component="a"
                href={settings.libraryUrl}
                target="_blank"
                rel="noopener noreferrer"
                label="Library"
                leftSection={<IconBook size={20} />}
                rightSection={<IconExternalLink size={16} />}
              />
            )}
          <NavLink
            component={Link}
            to="/settings"
            label="Settings"
            leftSection={<IconSettings size={20} />}
            onClick={() => toggle()}
            style={{ marginTop: "auto", marginBottom: 0 }}
          />
          <VersionFooter />
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>

      <TanStackRouterDevtools position="bottom-right" />
    </AppShell>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
});
