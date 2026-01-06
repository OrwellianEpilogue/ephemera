import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Box,
  Button,
  Card,
  Group,
  Stack,
  Text,
  Title,
  Table,
  Badge,
  Modal,
  TextInput,
  PasswordInput,
  Select,
  Switch,
  ActionIcon,
  Alert,
  Loader,
  Center,
} from "@mantine/core";
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconUser,
  IconUserX,
  IconShieldCheck,
  IconAlertCircle,
  IconCheck,
  IconX,
  IconKey,
  IconPlugConnected,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { apiFetch } from "@ephemera/shared";

interface Permissions {
  canDeleteDownloads: boolean;
  canConfigureNotifications: boolean;
  canManageRequests: boolean;
  canStartDownloads: boolean;
  canConfigureApp: boolean;
  canConfigureIntegrations: boolean;
  canConfigureEmail: boolean;
  canSeeDownloadOwner: boolean;
  canManageApiKeys: boolean;
}

const DEFAULT_PERMISSIONS: Permissions = {
  canDeleteDownloads: false,
  canConfigureNotifications: false,
  canManageRequests: false,
  canStartDownloads: true,
  canConfigureApp: false,
  canConfigureIntegrations: false,
  canConfigureEmail: false,
  canSeeDownloadOwner: false,
  canManageApiKeys: false,
};

interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: "admin" | "user";
  banned: boolean;
  banReason: string | null;
  createdAt: string;
  updatedAt: string;
  permissions: Permissions | null;
  hasPassword: boolean;
  hasOIDC: boolean;
}

interface PermissionsFormProps {
  permissions: Permissions;
  onChange: (permissions: Permissions) => void;
}

function PermissionsForm({ permissions, onChange }: PermissionsFormProps) {
  const { t } = useTranslation("translation", {
    keyPrefix: "settings.users",
  });
  const handleChange = (key: keyof Permissions, value: boolean) => {
    onChange({ ...permissions, [key]: value });
  };

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        {t("permissions.title")}
      </Text>
      <Switch
        label={t("permissions.delete_downloads")}
        checked={permissions.canDeleteDownloads}
        onChange={(e) =>
          handleChange("canDeleteDownloads", e.currentTarget.checked)
        }
      />
      <Switch
        label={t("permissions.manage_requests")}
        checked={permissions.canManageRequests}
        onChange={(e) =>
          handleChange("canManageRequests", e.currentTarget.checked)
        }
      />
      <Stack gap={4}>
        <Switch
          label={t("permissions.start_downloads")}
          checked={permissions.canStartDownloads}
          onChange={(e) =>
            handleChange("canStartDownloads", e.currentTarget.checked)
          }
        />
        <Text size="xs" c="dimmed" ml="xl">
          {t("permissions.start_downloads_desc")}
        </Text>
      </Stack>
      <Switch
        label={t("permissions.configure_app")}
        checked={permissions.canConfigureApp}
        onChange={(e) =>
          handleChange("canConfigureApp", e.currentTarget.checked)
        }
      />
      <Switch
        label={t("permissions.configure_integrations")}
        checked={permissions.canConfigureIntegrations}
        onChange={(e) =>
          handleChange("canConfigureIntegrations", e.currentTarget.checked)
        }
      />
      <Switch
        label={t("permissions.configure_notifications")}
        checked={permissions.canConfigureNotifications}
        onChange={(e) =>
          handleChange("canConfigureNotifications", e.currentTarget.checked)
        }
      />
      <Switch
        label={t("permissions.configure_email")}
        checked={permissions.canConfigureEmail}
        onChange={(e) =>
          handleChange("canConfigureEmail", e.currentTarget.checked)
        }
      />
      <Switch
        label={t("permissions.see_owner")}
        checked={permissions.canSeeDownloadOwner}
        onChange={(e) =>
          handleChange("canSeeDownloadOwner", e.currentTarget.checked)
        }
      />
      <Switch
        label={t("permissions.manage_api_keys")}
        checked={permissions.canManageApiKeys}
        onChange={(e) =>
          handleChange("canManageApiKeys", e.currentTarget.checked)
        }
      />
    </Stack>
  );
}

interface CreateUserForm {
  name: string;
  email: string;
  password: string;
  role: "admin" | "user";
  permissions: Permissions;
}

export default function UsersManagement() {
  const { t } = useTranslation("translation", {
    keyPrefix: "settings.users",
  });
  const queryClient = useQueryClient();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showPasswordField, setShowPasswordField] = useState(false);

  // Form state for create
  const [createForm, setCreateForm] = useState<CreateUserForm>({
    name: "",
    email: "",
    password: "",
    role: "user",
    permissions: { ...DEFAULT_PERMISSIONS },
  });

  // Fetch users
  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: () => apiFetch<User[]>("/users"),
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: (data: CreateUserForm) =>
      apiFetch<User>("/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setCreateModalOpen(false);
      setCreateForm({
        name: "",
        email: "",
        password: "",
        role: "user",
        permissions: { ...DEFAULT_PERMISSIONS },
      });
      setError(null);
    },
    onError: (error: unknown) => {
      setError(
        error instanceof Error ? error.message : "Failed to create user",
      );
    },
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<User> }) =>
      apiFetch<User>(`/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setEditModalOpen(false);
      setSelectedUser(null);
      setError(null);
    },
    onError: (error: unknown) => {
      setError(
        error instanceof Error ? error.message : "Failed to update user",
      );
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/users/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error: unknown) => {
      setError(
        error instanceof Error ? error.message : "Failed to delete user",
      );
    },
  });

  // Set user password mutation (admin)
  const setPasswordMutation = useMutation({
    mutationFn: ({
      userId,
      newPassword,
    }: {
      userId: string;
      newPassword: string;
    }) =>
      apiFetch<{ success: boolean }>(`/users/${userId}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      }),
    onSuccess: () => {
      setShowPasswordField(false);
      setNewPassword("");
      notifications.show({
        title: t("users.notifications.password_updated.title"),
        message: t("users.notifications.password_updated.message"),
        color: "green",
        icon: <IconCheck size={16} />,
      });
    },
    onError: (error: unknown) => {
      setError(
        error instanceof Error ? error.message : "Failed to set password",
      );
    },
  });

  const handleCreateUser = () => {
    setError(null);
    createUserMutation.mutate(createForm);
  };

  const handleUpdateUser = () => {
    if (!selectedUser) return;
    setError(null);
    updateUserMutation.mutate({
      id: selectedUser.id,
      data: {
        name: selectedUser.name,
        email: selectedUser.email,
        role: selectedUser.role,
        banned: selectedUser.banned,
        banReason: selectedUser.banReason,
        permissions: selectedUser.permissions || undefined,
      },
    });
  };

  const handleDeleteUser = (id: string) => {
    if (confirm(t("users.confirm_delete"))) {
      deleteUserMutation.mutate(id);
    }
  };

  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    setEditModalOpen(true);
    setError(null);
    setNewPassword("");
    setShowPasswordField(false);
  };

  const handleResetPassword = () => {
    if (!selectedUser || newPassword.length < 8) return;
    setError(null);
    setPasswordMutation.mutate({
      userId: selectedUser.id,
      newPassword,
    });
  };

  if (isLoading) {
    return (
      <Center h={400}>
        <Loader size="lg" />
      </Center>
    );
  }

  return (
    <Box>
      <Group justify="space-between" mb="xl">
        <div>
          <Title order={2}>{t("title")}</Title>
          <Text c="dimmed" size="sm">
            {t("description")}
          </Text>
        </div>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => setCreateModalOpen(true)}
        >
          {t("create_button")}
        </Button>
      </Group>

      {error && (
        <Alert
          icon={<IconAlertCircle size={16} />}
          title="Error"
          color="red"
          mb="md"
          onClose={() => setError(null)}
          withCloseButton
        >
          {error}
        </Alert>
      )}

      <Card>
        <Table.ScrollContainer minWidth={800}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("table.user")}</Table.Th>
                <Table.Th>{t("table.email")}</Table.Th>
                <Table.Th>{t("table.password")}</Table.Th>
                <Table.Th>{t("table.oidc")}</Table.Th>
                <Table.Th>{t("table.role")}</Table.Th>
                <Table.Th>{t("table.status")}</Table.Th>
                <Table.Th>{t("table.created")}</Table.Th>
                <Table.Th>{t("table.actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {users?.map((user) => (
                <Table.Tr key={user.id}>
                  <Table.Td>
                    <Group gap="sm">
                      {user.role === "admin" ? (
                        <IconShieldCheck size={16} />
                      ) : (
                        <IconUser size={16} />
                      )}
                      <Text fw={500}>{user.name}</Text>
                    </Group>
                  </Table.Td>
                  <Table.Td>{user.email}</Table.Td>
                  <Table.Td>
                    {user.hasPassword ? (
                      <IconCheck
                        size={16}
                        color="var(--mantine-color-green-6)"
                      />
                    ) : (
                      <IconX size={16} color="var(--mantine-color-gray-5)" />
                    )}
                  </Table.Td>
                  <Table.Td>
                    {user.hasOIDC ? (
                      <IconCheck
                        size={16}
                        color="var(--mantine-color-green-6)"
                      />
                    ) : (
                      <IconX size={16} color="var(--mantine-color-gray-5)" />
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Badge color={user.role === "admin" ? "blue" : "gray"}>
                      {user.role}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {user.banned ? (
                      <Badge color="red" leftSection={<IconUserX size={12} />}>
                        {t("table.status_banned")}
                      </Badge>
                    ) : (
                      <Badge color="green">{t("table.status_active")}</Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {new Date(user.createdAt).toLocaleDateString()}
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <ActionIcon
                        variant="subtle"
                        onClick={() => handleEditUser(user)}
                      >
                        <IconEdit size={16} />
                      </ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        onClick={() => handleDeleteUser(user.id)}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>

      {/* Create User Modal */}
      <Modal
        opened={createModalOpen}
        onClose={() => {
          setCreateModalOpen(false);
          setError(null);
        }}
        title={t("create_modal.title")}
        size="lg"
      >
        <Stack gap="md">
          <TextInput
            label={t("create_modal.name")}
            placeholder="John Doe"
            required
            value={createForm.name}
            onChange={(e) =>
              setCreateForm({ ...createForm, name: e.target.value })
            }
          />

          <TextInput
            label={t("create_modal.email")}
            placeholder="user@example.com"
            type="email"
            required
            value={createForm.email}
            onChange={(e) =>
              setCreateForm({ ...createForm, email: e.target.value })
            }
          />

          <PasswordInput
            label={t("create_modal.password")}
            placeholder="Minimum 8 characters"
            required
            value={createForm.password}
            onChange={(e) =>
              setCreateForm({ ...createForm, password: e.target.value })
            }
          />

          <Select
            label={t("create_modal.role")}
            data={[
              { value: "user", label: "User" },
              { value: "admin", label: "Admin" },
            ]}
            value={createForm.role}
            onChange={(value) =>
              setCreateForm({
                ...createForm,
                role: value as "admin" | "user",
              })
            }
          />

          {createForm.role === "admin" ? (
            <Alert color="blue" variant="light">
              {t("permissions.admin_alert")}
            </Alert>
          ) : (
            <PermissionsForm
              permissions={createForm.permissions}
              onChange={(permissions) =>
                setCreateForm({ ...createForm, permissions })
              }
            />
          )}

          <Group justify="flex-end" mt="md">
            <Button
              variant="default"
              onClick={() => {
                setCreateModalOpen(false);
                setError(null);
              }}
            >
              {t("create_modal.cancel")}
            </Button>
            <Button
              onClick={handleCreateUser}
              loading={createUserMutation.isPending}
            >
              {t("create_modal.submit")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        opened={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setSelectedUser(null);
          setError(null);
        }}
        title={t("edit_modal.title")}
        size="lg"
      >
        {selectedUser && (
          <Stack gap="md">
            <TextInput
              label={t("edit_modal.name")}
              value={selectedUser.name}
              onChange={(e) =>
                setSelectedUser({ ...selectedUser, name: e.target.value })
              }
            />

            <TextInput
              label={t("edit_modal.email")}
              type="email"
              value={selectedUser.email}
              onChange={(e) =>
                setSelectedUser({ ...selectedUser, email: e.target.value })
              }
            />

            <Select
              label={t("edit_modal.role")}
              data={[
                { value: "user", label: "User" },
                { value: "admin", label: "Admin" },
              ]}
              value={selectedUser.role}
              onChange={(value) =>
                setSelectedUser({
                  ...selectedUser,
                  role: value as "admin" | "user",
                })
              }
            />

            <Switch
              label={t("edit_modal.ban")}
              checked={selectedUser.banned}
              onChange={(e) =>
                setSelectedUser({
                  ...selectedUser,
                  banned: e.currentTarget.checked,
                })
              }
            />

            {selectedUser.banned && (
              <TextInput
                label={t("edit_modal.ban_reason")}
                placeholder="Reason for ban"
                value={selectedUser.banReason || ""}
                onChange={(e) =>
                  setSelectedUser({
                    ...selectedUser,
                    banReason: e.target.value,
                  })
                }
              />
            )}

            {selectedUser.role === "admin" ? (
              <Alert color="blue" variant="light">
                {t("permissions.admin_alert")}
              </Alert>
            ) : (
              <PermissionsForm
                permissions={selectedUser.permissions || DEFAULT_PERMISSIONS}
                onChange={(permissions) =>
                  setSelectedUser({ ...selectedUser, permissions })
                }
              />
            )}

            {/* Password Reset Section */}
            <Stack gap="xs">
              <Text size="sm" fw={500}>
                {t("edit_modal.password_title")}
              </Text>
              {selectedUser.hasPassword ? (
                !showPasswordField ? (
                  <Button
                    variant="outline"
                    size="sm"
                    leftSection={<IconKey size={16} />}
                    onClick={() => setShowPasswordField(true)}
                    w="fit-content"
                  >
                    {t("edit_modal.reset_password")}
                  </Button>
                ) : (
                  <Group gap="xs" align="flex-end">
                    <PasswordInput
                      placeholder={t("edit_modal.new_password_placeholder")}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      style={{ flex: 1 }}
                      size="sm"
                    />
                    <Button
                      size="sm"
                      onClick={handleResetPassword}
                      disabled={newPassword.length < 8}
                      loading={setPasswordMutation.isPending}
                    >
                      {t("edit_modal.set_password")}
                    </Button>
                    <Button
                      size="sm"
                      variant="subtle"
                      onClick={() => {
                        setShowPasswordField(false);
                        setNewPassword("");
                      }}
                    >
                      Cancel
                    </Button>
                  </Group>
                )
              ) : selectedUser.hasOIDC ? (
                <Alert
                  color="blue"
                  icon={<IconPlugConnected size={16} />}
                  p="xs"
                >
                  <Text size="sm">{t("edit_modal.sso_only")}</Text>
                </Alert>
              ) : (
                <Text size="sm" c="dimmed">
                  {t("edit_modal.no_auth")}
                </Text>
              )}
            </Stack>

            <Group justify="flex-end" mt="md">
              <Button
                variant="default"
                onClick={() => {
                  setEditModalOpen(false);
                  setSelectedUser(null);
                  setError(null);
                }}
              >
                {t("edit_modal.cancel")}
              </Button>
              <Button
                onClick={handleUpdateUser}
                loading={updateUserMutation.isPending}
              >
                {t("edit_modal.save")}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Box>
  );
}
