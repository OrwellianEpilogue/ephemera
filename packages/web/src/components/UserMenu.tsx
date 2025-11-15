import {
  Menu,
  UnstyledButton,
  Group,
  Avatar,
  Text,
  Badge,
  rem,
} from "@mantine/core";
import {
  IconChevronDown,
  IconLogout,
  IconSettings,
  IconUsers,
  IconPlugConnected,
} from "@tabler/icons-react";
import { useAuth } from "../hooks/useAuth";
import { signOut } from "../lib/auth-client";
import { useNavigate } from "@tanstack/react-router";

export function UserMenu() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    return null;
  }

  const handleSignOut = async () => {
    try {
      await signOut();
      // Redirect to login page after sign out
      navigate({ to: "/login" });
    } catch (error) {
      console.error("[UserMenu] Sign out error:", error);
    }
  };

  // Get user initials for avatar
  const getInitials = (name?: string | null, email?: string | null) => {
    if (name) {
      return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    if (email) {
      return email[0]?.toUpperCase() || "U";
    }
    return "U";
  };

  const initials = getInitials(user.name, user.email);

  return (
    <Menu
      width={260}
      position="bottom-end"
      transitionProps={{ transition: "pop-top-right" }}
      withinPortal
    >
      <Menu.Target>
        <UnstyledButton
          style={{
            padding: "var(--mantine-spacing-xs)",
            borderRadius: "var(--mantine-radius-sm)",
            transition: "background-color 100ms ease",
            "&:hover": {
              backgroundColor: "var(--mantine-color-dark-5)",
            },
          }}
        >
          <Group gap={7}>
            <Avatar radius="xl" size={32} color="custom-primary">
              {initials}
            </Avatar>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" fw={500} truncate>
                {user.name || user.email}
              </Text>
              {isAdmin && (
                <Badge size="xs" variant="light" color="blue">
                  Admin
                </Badge>
              )}
            </div>
            <IconChevronDown
              style={{ width: rem(12), height: rem(12) }}
              stroke={1.5}
            />
          </Group>
        </UnstyledButton>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>Account</Menu.Label>
        <Menu.Item disabled>
          <div>
            <Text size="sm" fw={500}>
              {user.name || "User"}
            </Text>
            <Text size="xs" c="dimmed">
              {user.email}
            </Text>
            {isAdmin && (
              <Badge size="xs" variant="light" color="blue" mt={4}>
                Administrator
              </Badge>
            )}
          </div>
        </Menu.Item>

        <Menu.Divider />

        <Menu.Label>Actions</Menu.Label>
        <Menu.Item
          leftSection={
            <IconSettings style={{ width: rem(16), height: rem(16) }} />
          }
          onClick={() => navigate({ to: "/settings" })}
        >
          Settings
        </Menu.Item>

        {isAdmin && (
          <>
            <Menu.Item
              leftSection={
                <IconUsers style={{ width: rem(16), height: rem(16) }} />
              }
              onClick={() =>
                navigate({ to: "/settings", search: { tab: "users" } })
              }
            >
              Manage Users
            </Menu.Item>
            <Menu.Item
              leftSection={
                <IconPlugConnected
                  style={{ width: rem(16), height: rem(16) }}
                />
              }
              onClick={() =>
                navigate({ to: "/settings", search: { tab: "oidc" } })
              }
            >
              OIDC Providers
            </Menu.Item>
          </>
        )}

        <Menu.Divider />

        <Menu.Item
          color="red"
          leftSection={
            <IconLogout style={{ width: rem(16), height: rem(16) }} />
          }
          onClick={handleSignOut}
        >
          Sign out
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
