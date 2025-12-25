import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  canConfigureApp: boolean;
  canConfigureIntegrations: boolean;
  canConfigureEmail: boolean;
  canSeeDownloadOwner: boolean;
}

const DEFAULT_PERMISSIONS: Permissions = {
  canDeleteDownloads: false,
  canConfigureNotifications: false,
  canManageRequests: false,
  canConfigureApp: false,
  canConfigureIntegrations: false,
  canConfigureEmail: false,
  canSeeDownloadOwner: false,
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
  const handleChange = (key: keyof Permissions, value: boolean) => {
    onChange({ ...permissions, [key]: value });
  };

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        Permissions
      </Text>
      <Switch
        label="Can delete downloads"
        checked={permissions.canDeleteDownloads}
        onChange={(e) =>
          handleChange("canDeleteDownloads", e.currentTarget.checked)
        }
      />
      <Switch
        label="Can manage requests"
        checked={permissions.canManageRequests}
        onChange={(e) =>
          handleChange("canManageRequests", e.currentTarget.checked)
        }
      />
      <Switch
        label="Can configure app settings (General)"
        checked={permissions.canConfigureApp}
        onChange={(e) =>
          handleChange("canConfigureApp", e.currentTarget.checked)
        }
      />
      <Switch
        label="Can configure integrations (Booklore, Indexer)"
        checked={permissions.canConfigureIntegrations}
        onChange={(e) =>
          handleChange("canConfigureIntegrations", e.currentTarget.checked)
        }
      />
      <Switch
        label="Can configure notifications"
        checked={permissions.canConfigureNotifications}
        onChange={(e) =>
          handleChange("canConfigureNotifications", e.currentTarget.checked)
        }
      />
      <Switch
        label="Can configure email settings"
        checked={permissions.canConfigureEmail}
        onChange={(e) =>
          handleChange("canConfigureEmail", e.currentTarget.checked)
        }
      />
      <Switch
        label="Can see download owner"
        checked={permissions.canSeeDownloadOwner}
        onChange={(e) =>
          handleChange("canSeeDownloadOwner", e.currentTarget.checked)
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
        title: "Password Updated",
        message: "User password has been reset successfully",
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
    if (confirm("Are you sure you want to delete this user?")) {
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
          <Title order={2}>User Management</Title>
          <Text c="dimmed" size="sm">
            Manage user accounts, roles, and permissions
          </Text>
        </div>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => setCreateModalOpen(true)}
        >
          Create User
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
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>User</Table.Th>
              <Table.Th>Email</Table.Th>
              <Table.Th>Password</Table.Th>
              <Table.Th>OIDC</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Created</Table.Th>
              <Table.Th>Actions</Table.Th>
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
                    <IconCheck size={16} color="var(--mantine-color-green-6)" />
                  ) : (
                    <IconX size={16} color="var(--mantine-color-gray-5)" />
                  )}
                </Table.Td>
                <Table.Td>
                  {user.hasOIDC ? (
                    <IconCheck size={16} color="var(--mantine-color-green-6)" />
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
                      Banned
                    </Badge>
                  ) : (
                    <Badge color="green">Active</Badge>
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
      </Card>

      {/* Create User Modal */}
      <Modal
        opened={createModalOpen}
        onClose={() => {
          setCreateModalOpen(false);
          setError(null);
        }}
        title="Create New User"
        size="lg"
      >
        <Stack gap="md">
          <TextInput
            label="Name"
            placeholder="John Doe"
            required
            value={createForm.name}
            onChange={(e) =>
              setCreateForm({ ...createForm, name: e.target.value })
            }
          />

          <TextInput
            label="Email"
            placeholder="user@example.com"
            type="email"
            required
            value={createForm.email}
            onChange={(e) =>
              setCreateForm({ ...createForm, email: e.target.value })
            }
          />

          <PasswordInput
            label="Password"
            placeholder="Minimum 8 characters"
            required
            value={createForm.password}
            onChange={(e) =>
              setCreateForm({ ...createForm, password: e.target.value })
            }
          />

          <Select
            label="Role"
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

          <PermissionsForm
            permissions={createForm.permissions}
            onChange={(permissions) =>
              setCreateForm({ ...createForm, permissions })
            }
          />

          <Group justify="flex-end" mt="md">
            <Button
              variant="default"
              onClick={() => {
                setCreateModalOpen(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateUser}
              loading={createUserMutation.isPending}
            >
              Create User
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
        title="Edit User"
        size="lg"
      >
        {selectedUser && (
          <Stack gap="md">
            <TextInput
              label="Name"
              value={selectedUser.name}
              onChange={(e) =>
                setSelectedUser({ ...selectedUser, name: e.target.value })
              }
            />

            <TextInput
              label="Email"
              type="email"
              value={selectedUser.email}
              onChange={(e) =>
                setSelectedUser({ ...selectedUser, email: e.target.value })
              }
            />

            <Select
              label="Role"
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
              label="Ban user"
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
                label="Ban reason"
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

            <PermissionsForm
              permissions={selectedUser.permissions || DEFAULT_PERMISSIONS}
              onChange={(permissions) =>
                setSelectedUser({ ...selectedUser, permissions })
              }
            />

            {/* Password Reset Section */}
            <Stack gap="xs">
              <Text size="sm" fw={500}>
                Password
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
                    Reset Password
                  </Button>
                ) : (
                  <Group gap="xs" align="flex-end">
                    <PasswordInput
                      placeholder="New password (min 8 chars)"
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
                      Set
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
                  <Text size="sm">
                    This user authenticates via SSO only. Password cannot be
                    set.
                  </Text>
                </Alert>
              ) : (
                <Text size="sm" c="dimmed">
                  No authentication method configured
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
                Cancel
              </Button>
              <Button
                onClick={handleUpdateUser}
                loading={updateUserMutation.isPending}
              >
                Save Changes
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Box>
  );
}
