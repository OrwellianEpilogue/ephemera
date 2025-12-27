import {
  createRootRoute,
  Link,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
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
import { useRequests, useRequestStats } from "../hooks/useRequests";
import { useAppSettings } from "../hooks/useSettings";
import { useAuth, usePermissions } from "../hooks/useAuth";
import { VersionFooter } from "../components/VersionFooter";
import { UserMenu } from "../components/UserMenu";

function RootComponent() {
  const [opened, { toggle }] = useDisclosure();
  const { setColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme("light", {
    getInitialValueInEffect: true,
  });

  // Get current route to determine if we should show the app shell
  const router = useRouterState();
  const currentPath = router.location.pathname;
  const isAuthPage = currentPath === "/login" || currentPath === "/setup";

  // Establish SSE connections at root level (stays alive throughout session)
  const { data: queue } = useQueue({
    notifyOnComplete: true,
    enableSSE: !isAuthPage,
  });
  useRequests(undefined, { enableSSE: !isAuthPage }); // Enable SSE for requests at root level

  const toggleColorScheme = () => {
    setColorScheme(computedColorScheme === "light" ? "dark" : "light");
  };

  // Fetch request stats for badge (will be updated via SSE)
  const { data: requestStats } = useRequestStats();

  // Fetch app settings for library link
  const { data: settings } = useAppSettings();

  // Calculate queue badge counts
  const queueingCount = queue ? Object.keys(queue.queued).length : 0;
  const downloadingCount = queue ? Object.keys(queue.downloading).length : 0;
  const delayedCount = queue ? Object.keys(queue.delayed).length : 0;
  const totalActiveCount = queueingCount + downloadingCount + delayedCount;

  // Get active requests count for badge
  const activeCount = requestStats?.active || 0;

  // Get pending approval count for managers
  const pendingApprovalCount = requestStats?.pending_approval || 0;

  // Check if user can manage requests (for pending approval badge)
  const { isAdmin } = useAuth();
  const { data: permissions } = usePermissions();
  const canManageRequests = isAdmin || permissions?.canManageRequests;

  // If on auth pages (login/setup), render without app shell
  if (isAuthPage) {
    return (
      <>
        <Outlet />
        {import.meta.env.DEV && (
          <TanStackRouterDevtools position="bottom-right" />
        )}
      </>
    );
  }

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
            <UserMenu />
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
                <Badge
                  size="sm"
                  variant="filled"
                  color="blue"
                  circle={totalActiveCount < 10}
                >
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
              activeCount > 0 ||
              (canManageRequests && pendingApprovalCount > 0) ? (
                <Group gap={4}>
                  {canManageRequests && pendingApprovalCount > 0 && (
                    <Badge
                      size="sm"
                      variant="filled"
                      color="orange"
                      circle={pendingApprovalCount < 10}
                    >
                      {pendingApprovalCount}
                    </Badge>
                  )}
                  {activeCount > 0 && (
                    <Badge
                      size="sm"
                      variant="filled"
                      color="blue"
                      circle={activeCount < 10}
                    >
                      {activeCount}
                    </Badge>
                  )}
                </Group>
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

      {import.meta.env.DEV && (
        <TanStackRouterDevtools position="bottom-right" />
      )}
    </AppShell>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
});
