import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Stack,
  Text,
  TextInput,
  PasswordInput,
  Button,
  Group,
  Alert,
  Divider,
  Loader,
  Center,
  Paper,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconInfoCircle,
  IconKey,
  IconMail,
  IconUser,
  IconCheck,
  IconLock,
  IconPlugConnected,
} from "@tabler/icons-react";
import { apiFetch } from "@ephemera/shared";
import { changePassword } from "../lib/auth-client";

interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
  hasPassword: boolean;
  hasOIDC: boolean;
}

export default function AccountSettings() {
  const queryClient = useQueryClient();

  // Fetch current user info
  const { data: currentUser, isLoading } = useQuery<CurrentUser>({
    queryKey: ["currentUser"],
    queryFn: () => apiFetch<CurrentUser>("/users/me"),
  });

  // Profile form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  // Password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Initialize form values when user data loads
  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name);
      setEmail(currentUser.email);
    }
  }, [currentUser]);

  // Profile update mutation
  const updateProfileMutation = useMutation({
    mutationFn: (data: { name?: string; email?: string }) =>
      apiFetch<CurrentUser>("/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(["currentUser"], updatedUser);
      notifications.show({
        title: "Profile Updated",
        message: "Your profile has been updated successfully",
        color: "green",
        icon: <IconCheck size={16} />,
      });
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message:
          error instanceof Error ? error.message : "Failed to update profile",
        color: "red",
      });
    },
  });

  // Password change mutation
  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      const result = await changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: false,
      });
      if (result.error) {
        throw new Error(result.error.message || "Failed to change password");
      }
      return result;
    },
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordError(null);
      notifications.show({
        title: "Password Changed",
        message: "Your password has been updated successfully",
        color: "green",
        icon: <IconCheck size={16} />,
      });
    },
    onError: (error) => {
      setPasswordError(
        error instanceof Error ? error.message : "Failed to change password",
      );
    },
  });

  // Check if profile has changes
  const hasProfileChanges =
    currentUser && (name !== currentUser.name || email !== currentUser.email);

  // Validate password change
  const canChangePassword =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    newPassword === confirmPassword;

  const handleSaveProfile = () => {
    const updates: { name?: string; email?: string } = {};
    if (name !== currentUser?.name) updates.name = name;
    if (email !== currentUser?.email) updates.email = email;
    updateProfileMutation.mutate(updates);
  };

  const handleChangePassword = () => {
    setPasswordError(null);
    changePasswordMutation.mutate();
  };

  if (isLoading) {
    return (
      <Center p="xl">
        <Loader size="lg" />
      </Center>
    );
  }

  if (!currentUser) {
    return (
      <Alert color="red" icon={<IconInfoCircle size={16} />}>
        Failed to load user information
      </Alert>
    );
  }

  return (
    <Stack gap="lg">
      {/* Profile Section */}
      <Paper p="md" withBorder>
        <Stack gap="md">
          <Group gap="xs">
            <IconUser size={20} />
            <Title order={4}>Profile</Title>
          </Group>
          <Text size="sm" c="dimmed">
            Update your account information
          </Text>

          <TextInput
            label="Name"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            leftSection={<IconUser size={16} />}
          />

          <TextInput
            label="Email"
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={currentUser.hasOIDC && !currentUser.hasPassword}
            description={
              currentUser.hasOIDC && !currentUser.hasPassword
                ? "Email cannot be changed for SSO-only accounts"
                : undefined
            }
            leftSection={<IconMail size={16} />}
          />

          <Group justify="flex-end">
            <Button
              onClick={handleSaveProfile}
              disabled={!hasProfileChanges}
              loading={updateProfileMutation.isPending}
            >
              Save Profile
            </Button>
          </Group>
        </Stack>
      </Paper>

      {/* Password Section - Only show if user has credential account */}
      {currentUser.hasPassword ? (
        <Paper p="md" withBorder>
          <Stack gap="md">
            <Group gap="xs">
              <IconLock size={20} />
              <Title order={4}>Change Password</Title>
            </Group>
            <Text size="sm" c="dimmed">
              Update your account password
            </Text>

            {passwordError && (
              <Alert color="red" icon={<IconInfoCircle size={16} />}>
                {passwordError}
              </Alert>
            )}

            <PasswordInput
              label="Current Password"
              placeholder="Enter your current password"
              leftSection={<IconKey size={16} />}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />

            <Divider label="New Password" labelPosition="center" />

            <PasswordInput
              label="New Password"
              placeholder="Enter new password (min 8 characters)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              description="Must be at least 8 characters"
              required
            />

            <PasswordInput
              label="Confirm New Password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={
                confirmPassword && newPassword !== confirmPassword
                  ? "Passwords do not match"
                  : undefined
              }
              required
            />

            <Group justify="flex-end">
              <Button
                onClick={handleChangePassword}
                disabled={!canChangePassword}
                loading={changePasswordMutation.isPending}
              >
                Change Password
              </Button>
            </Group>
          </Stack>
        </Paper>
      ) : currentUser.hasOIDC ? (
        <Paper p="md" withBorder>
          <Alert icon={<IconPlugConnected size={16} />} color="blue">
            <Text size="sm">
              <strong>SSO Authentication:</strong> Your account uses Single
              Sign-On (SSO). Password management is handled by your identity
              provider.
            </Text>
          </Alert>
        </Paper>
      ) : null}

      {/* Auth Methods Info */}
      <Paper p="md" withBorder>
        <Stack gap="md">
          <Title order={4}>Authentication Methods</Title>
          <Stack gap="xs">
            <Group gap="xs">
              <IconKey size={16} />
              <Text size="sm" fw={500}>
                Password Login:
              </Text>
              <Text size="sm" c={currentUser.hasPassword ? "green" : "dimmed"}>
                {currentUser.hasPassword ? "Enabled" : "Not configured"}
              </Text>
            </Group>
            <Group gap="xs">
              <IconPlugConnected size={16} />
              <Text size="sm" fw={500}>
                SSO/OIDC:
              </Text>
              <Text size="sm" c={currentUser.hasOIDC ? "green" : "dimmed"}>
                {currentUser.hasOIDC ? "Linked" : "Not linked"}
              </Text>
            </Group>
          </Stack>
        </Stack>
      </Paper>
    </Stack>
  );
}
