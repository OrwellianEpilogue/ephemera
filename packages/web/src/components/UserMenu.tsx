import {
  Menu,
  UnstyledButton,
  Group,
  Avatar,
  Text,
  Badge,
  Box,
  rem,
} from "@mantine/core";
import {
  IconChevronDown,
  IconLogout,
  IconSettings,
  IconUser,
} from "@tabler/icons-react";
import { useAuth } from "../hooks/useAuth";
import { signOut } from "../lib/auth-client";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export function UserMenu() {
  const { t } = useTranslation("translation", {
    keyPrefix: "layout",
  });
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
            <Box visibleFrom="sm" style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" fw={500} truncate>
                {user.name || user.email}
              </Text>
              {isAdmin && (
                <Badge size="xs" variant="light" color="blue">
                  {t("roles.admin")}
                </Badge>
              )}
            </Box>
            <IconChevronDown
              style={{ width: rem(12), height: rem(12) }}
              stroke={1.5}
            />
          </Group>
        </UnstyledButton>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>{t("user_menu.account")}</Menu.Label>
        <Menu.Item disabled>
          <div>
            <Text size="sm" fw={500}>
              {user.name || t("user_menu.user_fallback")}
            </Text>
            <Text size="xs" c="dimmed">
              {user.email}
            </Text>
            {isAdmin && (
              <Badge size="xs" variant="light" color="blue" mt={4}>
                {t("roles.administrator")}
              </Badge>
            )}
          </div>
        </Menu.Item>

        <Menu.Divider />

        <Menu.Label>{t("user_menu.actions")}</Menu.Label>
        <Menu.Item
          leftSection={<IconUser style={{ width: rem(16), height: rem(16) }} />}
          onClick={() => navigate({ to: "/account" })}
        >
          {t("user_menu.my_account")}
        </Menu.Item>
        <Menu.Item
          leftSection={
            <IconSettings style={{ width: rem(16), height: rem(16) }} />
          }
          onClick={() => navigate({ to: "/settings" })}
        >
          {t("nav.settings")}
        </Menu.Item>

        <Menu.Divider />

        <Menu.Item
          color="red"
          leftSection={
            <IconLogout style={{ width: rem(16), height: rem(16) }} />
          }
          onClick={handleSignOut}
        >
          {t("user_menu.sign_out")}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
