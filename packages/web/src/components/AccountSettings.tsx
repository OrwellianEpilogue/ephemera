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
  Select,
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
  IconLanguage,
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
import { useTranslation } from "react-i18next";

interface CurrentUser {
  id: string;
  name: string;
  email: string;
  locale: string;
  role: "admin" | "user";
  hasPassword: boolean;
  hasOIDC: boolean;
}

export default function AccountSettings() {
  const { t, i18n } = useTranslation("translation", {
    keyPrefix: "account",
  });
  const queryClient = useQueryClient();

  // Fetch current user info
  const { data: currentUser, isLoading } = useQuery<CurrentUser>({
    queryKey: ["currentUser"],
    queryFn: () => apiFetch<CurrentUser>("/users/me"),
  });

  // Profile form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [locale, setLocale] = useState("");

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
      setLocale(currentUser.locale || "en");
    }
  }, [currentUser]);

  // Profile update mutation
  const updateProfileMutation = useMutation({
    mutationFn: (data: { name?: string; email?: string; locale?: string }) =>
      apiFetch<CurrentUser>("/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: async (updatedUser) => {
      queryClient.setQueryData(["currentUser"], updatedUser);
      setLocale(updatedUser.locale || "en");
      if (updatedUser.locale && i18n.language !== updatedUser.locale) {
        await i18n.changeLanguage(updatedUser.locale);
      }
      notifications.show({
        title: t("notifications.profile_updated.title"),
        message: t("notifications.profile_updated.message"),
        color: "green",
        icon: <IconCheck size={16} />,
      });
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message:
          error instanceof Error
            ? error.message
            : t("notifications.profile_update_failed"),
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
        throw new Error(
          result.error.message || t("notifications.password_change_failed"),
        );
      }
      return result;
    },
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordError(null);
      notifications.show({
        title: t("notifications.password_changed.title"),
        message: t("notifications.password_changed.message"),
        color: "green",
        icon: <IconCheck size={16} />,
      });
    },
    onError: (error) => {
      setPasswordError(
        error instanceof Error
          ? error.message
          : t("notifications.password_change_failed"),
      );
    },
  });

  // Derived states for validation
  const hasProfileChanges =
    currentUser &&
    (name !== currentUser.name ||
      email !== currentUser.email ||
      (locale !== "" && locale !== currentUser.locale));

  const canChangePassword =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    newPassword === confirmPassword;

  const handleSaveProfile = () => {
    const updates: { name?: string; email?: string; locale?: string } = {};
    if (name !== currentUser?.name) updates.name = name;
    if (email !== currentUser?.email) updates.email = email;
    if (locale !== currentUser?.locale) updates.locale = locale;
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
        expiresIn: newKeyExpiresIn ? newKeyExpiresIn * 24 * 60 * 60 : undefined,
      },
      {
        onSuccess: (data) => {
          setCreatedKey(data);
          setCreateKeyModalOpen(false);
          setNewKeyName("");
          setNewKeyExpiresIn(undefined);
        },
      },
    );
  };

  const handleDeleteApiKey = (keyId: string) => {
    deleteApiKeyMutation.mutate(keyId, {
      onSuccess: () => setKeyToDelete(null),
    });
  };

  const formatDateString = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(i18n.language, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const languageOptions = (i18n.options.supportedLngs || [])
    .filter((lng) => lng !== "cimode")
    .map((lng) => {
      const name = new Intl.DisplayNames([lng], { type: "language" }).of(lng);
      return {
        value: lng,
        label: name ? name.charAt(0).toUpperCase() + name.slice(1) : lng,
      };
    });

  if (isLoading)
    return (
      <Center p="xl">
        <Loader size="lg" />
      </Center>
    );
  if (!currentUser)
    return (
      <Alert color="red" icon={<IconInfoCircle size={16} />}>
        {t("errors.load_user_failed")}
      </Alert>
    );

  return (
    <Stack gap="lg">
      {/* Profile Section */}
      <Paper p="md" withBorder>
        <Stack gap="md">
          <Group gap="xs">
            <IconUser size={20} />
            <Title order={4}>{t("profile.title")}</Title>
          </Group>
          <Text size="sm" c="dimmed">
            {t("profile.description")}
          </Text>

          <TextInput
            label={t("profile.fields.name.label")}
            placeholder={t("profile.fields.name.placeholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            leftSection={<IconUser size={16} />}
          />

          <TextInput
            label={t("profile.fields.email.label")}
            type="email"
            placeholder={t("profile.fields.email.placeholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={currentUser.hasOIDC && !currentUser.hasPassword}
            description={
              currentUser.hasOIDC && !currentUser.hasPassword
                ? t("profile.fields.email.sso_warning")
                : undefined
            }
            leftSection={<IconMail size={16} />}
          />

          <Select
            label={t("profile.fields.language.label")}
            description={t("profile.fields.language.description")}
            value={locale}
            onChange={(v) => setLocale(v || "en")}
            data={languageOptions}
            leftSection={<IconLanguage size={16} />}
          />

          <Group justify="flex-end">
            <Button
              onClick={handleSaveProfile}
              disabled={!hasProfileChanges}
              loading={updateProfileMutation.isPending}
            >
              {t("profile.buttons.save")}
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
              <Title order={4}>{t("password.title")}</Title>
            </Group>
            <Text size="sm" c="dimmed">
              {t("password.description")}
            </Text>

            {passwordError && (
              <Alert color="red" icon={<IconInfoCircle size={16} />}>
                {passwordError}
              </Alert>
            )}

            <PasswordInput
              label={t("password.fields.current.label")}
              placeholder={t("password.fields.current.placeholder")}
              leftSection={<IconKey size={16} />}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />

            <Divider label={t("password.divider")} labelPosition="center" />

            <PasswordInput
              label={t("password.fields.new.label")}
              placeholder={t("password.fields.new.placeholder")}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              description={t("password.fields.new.description")}
              required
            />

            <PasswordInput
              label={t("password.fields.confirm.label")}
              placeholder={t("password.fields.confirm.placeholder")}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={
                confirmPassword && newPassword !== confirmPassword
                  ? t("password.errors.mismatch")
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
                {t("password.buttons.change")}
              </Button>
            </Group>
          </Stack>
        </Paper>
      ) : currentUser.hasOIDC ? (
        <Paper p="md" withBorder>
          <Alert icon={<IconPlugConnected size={16} />} color="blue">
            <Text size="sm">
              <strong>{t("sso.title")}:</strong> {t("sso.description")}
            </Text>
          </Alert>
        </Paper>
      ) : null}

      {/* Auth Methods Info */}
      <Paper p="md" withBorder>
        <Stack gap="md">
          <Title order={4}>{t("auth_methods.title")}</Title>
          <Stack gap="xs">
            <Group gap="xs">
              <IconKey size={16} />
              <Text size="sm" fw={500}>
                {t("auth_methods.password")}:
              </Text>
              <Text size="sm" c={currentUser.hasPassword ? "green" : "dimmed"}>
                {currentUser.hasPassword
                  ? t("auth_methods.enabled")
                  : t("auth_methods.not_configured")}
              </Text>
            </Group>
            <Group gap="xs">
              <IconPlugConnected size={16} />
              <Text size="sm" fw={500}>
                {t("auth_methods.sso")}:
              </Text>
              <Text size="sm" c={currentUser.hasOIDC ? "green" : "dimmed"}>
                {currentUser.hasOIDC
                  ? t("auth_methods.linked")
                  : t("auth_methods.not_linked")}
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
                <Title order={4}>{t("apikeys.title")}</Title>
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
                  {t("apikeys.buttons.docs")}
                </Button>
                <Button
                  size="xs"
                  leftSection={<IconPlus size={14} />}
                  onClick={() => setCreateKeyModalOpen(true)}
                >
                  {t("apikeys.buttons.create")}
                </Button>
              </Group>
            </Group>
            <Text size="sm" c="dimmed">
              {t("apikeys.description")}
            </Text>

            {apiKeysLoading ? (
              <Center p="md">
                <Loader size="sm" />
              </Center>
            ) : apiKeys && apiKeys.length > 0 ? (
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("apikeys.table.name")}</Table.Th>
                    <Table.Th>{t("apikeys.table.key")}</Table.Th>
                    <Table.Th>{t("apikeys.table.created")}</Table.Th>
                    <Table.Th>{t("apikeys.table.expires")}</Table.Th>
                    <Table.Th>{t("apikeys.table.status")}</Table.Th>
                    <Table.Th></Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {apiKeys.map((key) => (
                    <Table.Tr key={key.id}>
                      <Table.Td>{key.name || t("apikeys.unnamed")}</Table.Td>
                      <Table.Td>
                        <Code>...{key.start}</Code>
                      </Table.Td>
                      <Table.Td>{formatDateString(key.createdAt)}</Table.Td>
                      <Table.Td>
                        {key.expiresAt
                          ? formatDateString(key.expiresAt)
                          : t("apikeys.never")}
                      </Table.Td>
                      <Table.Td>
                        <Badge size="sm" color={key.enabled ? "green" : "red"}>
                          {key.enabled
                            ? t("apikeys.status.active")
                            : t("apikeys.status.disabled")}
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
                {t("apikeys.empty")}
              </Text>
            )}
          </Stack>
        </Paper>
      )}

      {/* Create API Key Modal */}
      <Modal
        opened={createKeyModalOpen}
        onClose={() => setCreateKeyModalOpen(false)}
        title={t("apikeys.create_modal.title")}
      >
        <Stack gap="md">
          <TextInput
            label={t("apikeys.create_modal.fields.name.label")}
            placeholder={t("apikeys.create_modal.fields.name.placeholder")}
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            required
          />
          <NumberInput
            label={t("apikeys.create_modal.fields.expires.label")}
            placeholder={t("apikeys.create_modal.fields.expires.placeholder")}
            description={t("apikeys.create_modal.fields.expires.description")}
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
              {t("common:actions.cancel")}
            </Button>
            <Button
              onClick={handleCreateApiKey}
              disabled={!newKeyName.trim()}
              loading={createApiKeyMutation.isPending}
            >
              {t("apikeys.create_modal.buttons.create")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={!!createdKey}
        onClose={() => setCreatedKey(null)}
        title={t("apikeys.created_modal.title")}
      >
        <Stack gap="md">
          <Alert color="yellow" icon={<IconInfoCircle size={16} />}>
            <Text size="sm" fw={500}>
              {t("apikeys.created_modal.warning")}
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
                <Tooltip
                  label={
                    copied
                      ? t("apikeys.created_modal.copied")
                      : t("apikeys.created_modal.copy")
                  }
                >
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
            {t("apikeys.created_modal.instruction")}
          </Text>
          <Group justify="flex-end" mt="md">
            <Button onClick={() => setCreatedKey(null)}>
              {t("common:actions.close")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={!!keyToDelete}
        onClose={() => setKeyToDelete(null)}
        title={t("apikeys.delete_modal.title")}
      >
        <Stack gap="md">
          <Text>{t("apikeys.delete_modal.message")}</Text>
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setKeyToDelete(null)}>
              {t("common:actions.cancel")}
            </Button>
            <Button
              color="red"
              onClick={() => keyToDelete && handleDeleteApiKey(keyToDelete)}
              loading={deleteApiKeyMutation.isPending}
            >
              {t("apikeys.delete_modal.confirm")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
