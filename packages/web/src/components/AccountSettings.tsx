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
  Modal,
  ActionIcon,
  CopyButton,
  Tooltip,
  Badge,
  Code,
  NumberInput,
  Table,
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
  IconPlus,
  IconTrash,
  IconCopy,
  IconApi,
  IconBook,
} from "@tabler/icons-react";
import { apiFetch } from "@ephemera/shared";
import { changePassword } from "../lib/auth-client";
import { usePermissions } from "../hooks/useAuth";
import {
  useApiKeys,
  useCreateApiKey,
  useDeleteApiKey,
  type NewApiKey,
} from "../hooks/useApiKeys";

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

  // API Keys state
  const [createKeyModalOpen, setCreateKeyModalOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyExpiresIn, setNewKeyExpiresIn] = useState<number | undefined>(
    undefined,
  );
  const [createdKey, setCreatedKey] = useState<NewApiKey | null>(null);
  const [keyToDelete, setKeyToDelete] = useState<string | null>(null);

  // Permissions and API keys hooks
  const { data: permissions } = usePermissions();
  const { data: apiKeys, isLoading: apiKeysLoading } = useApiKeys();
  const createApiKeyMutation = useCreateApiKey();
  const deleteApiKeyMutation = useDeleteApiKey();

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

  const handleCreateApiKey = () => {
    createApiKeyMutation.mutate(
      {
        name: newKeyName,
        expiresIn: newKeyExpiresIn ? newKeyExpiresIn * 24 * 60 * 60 : undefined, // Convert days to seconds
      },
      {
        onSuccess: (data) => {
          setCreatedKey(data);
          setCreateKeyModalOpen(false);
          setNewKeyName("");
          setNewKeyExpiresIn(undefined);
          notifications.show({
            title: "API Key Created",
            message:
              "Your new API key has been created. Copy it now - it won't be shown again!",
            color: "green",
            icon: <IconCheck size={16} />,
          });
        },
        onError: (error) => {
          notifications.show({
            title: "Error",
            message: error.message || "Failed to create API key",
            color: "red",
          });
        },
      },
    );
  };

  const handleDeleteApiKey = (keyId: string) => {
    deleteApiKeyMutation.mutate(keyId, {
      onSuccess: () => {
        setKeyToDelete(null);
        notifications.show({
          title: "API Key Deleted",
          message: "The API key has been revoked",
          color: "green",
          icon: <IconCheck size={16} />,
        });
      },
      onError: (error) => {
        notifications.show({
          title: "Error",
          message: error.message || "Failed to delete API key",
          color: "red",
        });
      },
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
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

      {/* API Keys Section - Only show if user has permission */}
      {permissions?.canManageApiKeys && (
        <Paper p="md" withBorder>
          <Stack gap="md">
            <Group justify="space-between">
              <Group gap="xs">
                <IconApi size={20} />
                <Title order={4}>API Keys</Title>
              </Group>
              <Group gap="xs">
                <Button
                  size="xs"
                  variant="default"
                  leftSection={<IconBook size={14} />}
                  component="a"
                  href="/api/docs"
                  target="_blank"
                >
                  Documentation
                </Button>
                <Button
                  size="xs"
                  leftSection={<IconPlus size={14} />}
                  onClick={() => setCreateKeyModalOpen(true)}
                >
                  Create Key
                </Button>
              </Group>
            </Group>
            <Text size="sm" c="dimmed">
              API keys allow third-party tools to access the API on your behalf.
              Use the <Code>x-api-key</Code> header to authenticate.
            </Text>

            {apiKeysLoading ? (
              <Center p="md">
                <Loader size="sm" />
              </Center>
            ) : apiKeys && apiKeys.length > 0 ? (
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Key</Table.Th>
                    <Table.Th>Created</Table.Th>
                    <Table.Th>Expires</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th></Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {apiKeys.map((key) => (
                    <Table.Tr key={key.id}>
                      <Table.Td>{key.name || "Unnamed"}</Table.Td>
                      <Table.Td>
                        <Code>...{key.start}</Code>
                      </Table.Td>
                      <Table.Td>{formatDate(key.createdAt)}</Table.Td>
                      <Table.Td>
                        {key.expiresAt ? formatDate(key.expiresAt) : "Never"}
                      </Table.Td>
                      <Table.Td>
                        <Badge size="sm" color={key.enabled ? "green" : "red"}>
                          {key.enabled ? "Active" : "Disabled"}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <ActionIcon
                          color="red"
                          variant="subtle"
                          onClick={() => setKeyToDelete(key.id)}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            ) : (
              <Text size="sm" c="dimmed" ta="center" py="md">
                No API keys created yet
              </Text>
            )}
          </Stack>
        </Paper>
      )}

      {/* Create API Key Modal */}
      <Modal
        opened={createKeyModalOpen}
        onClose={() => setCreateKeyModalOpen(false)}
        title="Create API Key"
      >
        <Stack gap="md">
          <TextInput
            label="Key Name"
            placeholder="My API Key"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            required
          />
          <NumberInput
            label="Expires in (days)"
            placeholder="Leave empty for no expiration"
            description="Optional: Set the number of days until this key expires"
            value={newKeyExpiresIn}
            onChange={(val) =>
              setNewKeyExpiresIn(typeof val === "number" ? val : undefined)
            }
            min={1}
            max={365}
          />
          <Group justify="flex-end" mt="md">
            <Button
              variant="default"
              onClick={() => setCreateKeyModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateApiKey}
              disabled={!newKeyName.trim()}
              loading={createApiKeyMutation.isPending}
            >
              Create Key
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Show Created Key Modal */}
      <Modal
        opened={!!createdKey}
        onClose={() => setCreatedKey(null)}
        title="API Key Created"
      >
        <Stack gap="md">
          <Alert color="yellow" icon={<IconInfoCircle size={16} />}>
            <Text size="sm" fw={500}>
              Copy your API key now. It will not be shown again!
            </Text>
          </Alert>
          <Group gap="xs">
            <Code
              style={{ flex: 1, padding: "8px 12px", wordBreak: "break-all" }}
            >
              {createdKey?.key}
            </Code>
            <CopyButton value={createdKey?.key || ""}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? "Copied!" : "Copy"}>
                  <ActionIcon
                    color={copied ? "teal" : "gray"}
                    variant="subtle"
                    onClick={copy}
                  >
                    {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          </Group>
          <Text size="sm" c="dimmed">
            Use this key in the <Code>x-api-key</Code> header when making API
            requests.
          </Text>
          <Group justify="flex-end" mt="md">
            <Button onClick={() => setCreatedKey(null)}>Done</Button>
          </Group>
        </Stack>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        opened={!!keyToDelete}
        onClose={() => setKeyToDelete(null)}
        title="Delete API Key"
      >
        <Stack gap="md">
          <Text>
            Are you sure you want to delete this API key? Any applications using
            this key will lose access immediately.
          </Text>
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setKeyToDelete(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              onClick={() => keyToDelete && handleDeleteApiKey(keyToDelete)}
              loading={deleteApiKeyMutation.isPending}
            >
              Delete Key
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
