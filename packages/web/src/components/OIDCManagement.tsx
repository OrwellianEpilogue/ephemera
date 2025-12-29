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
  Switch,
  ActionIcon,
  Alert,
  Loader,
  Center,
  TagsInput,
  Tooltip,
  Select,
  Input,
} from "@mantine/core";
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconPlugConnected,
  IconAlertCircle,
  IconCheck,
  IconX,
  IconChevronDown,
  IconChevronUp,
} from "@tabler/icons-react";
import { apiFetch } from "@ephemera/shared";

interface DefaultPermissions {
  canDeleteDownloads?: boolean;
  canConfigureNotifications?: boolean;
  canManageRequests?: boolean;
  canStartDownloads?: boolean;
  canConfigureApp?: boolean;
  canConfigureIntegrations?: boolean;
  canConfigureEmail?: boolean;
  canSeeDownloadOwner?: boolean;
  canManageApiKeys?: boolean;
  canConfigureTolino?: boolean;
  canManageLists?: boolean;
}

interface OIDCProvider {
  id: string;
  providerId: string;
  name?: string;
  issuer: string;
  domain: string | null;
  allowAutoProvision: boolean;
  enabled: boolean;
  groupClaimName: string | null;
  adminGroupValue: string | null;
  defaultPermissions: DefaultPermissions | null;
  oidcConfig: {
    clientId: string;
    clientSecret: string;
    scopes: string[];
    discoveryUrl?: string;
    pkce: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

interface CreateProviderForm {
  providerId: string;
  name: string;
  issuer: string;
  discoveryUrl: string;
  domain: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  allowAutoProvision: boolean;
  enabled: boolean;
  groupClaimName: string;
  adminGroupValue: string;
  defaultPermissions: DefaultPermissions;
}

interface TestResult {
  success: boolean;
  message: string;
}

interface DiscoveryResult {
  issuer?: string;
  error?: string;
}

function OIDCProvidersPage() {
  const queryClient = useQueryClient();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<OIDCProvider | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showEditAdvanced, setShowEditAdvanced] = useState(false);
  const [discoveryResult, setDiscoveryResult] =
    useState<DiscoveryResult | null>(null);
  const [fetchingDiscovery, setFetchingDiscovery] = useState(false);

  // Form state for create
  const [createForm, setCreateForm] = useState<CreateProviderForm>({
    providerId: "",
    name: "",
    issuer: "",
    discoveryUrl: "",
    domain: "",
    clientId: "",
    clientSecret: "",
    scopes: ["openid", "email", "profile", "groups"],
    allowAutoProvision: false,
    enabled: true,
    groupClaimName: "",
    adminGroupValue: "",
    defaultPermissions: {},
  });
  const [createProtocol, setCreateProtocol] = useState<"https://" | "http://">(
    "https://",
  );
  const [editProtocol, setEditProtocol] = useState<"https://" | "http://">(
    "https://",
  );

  // Fetch providers
  const { data: providers, isLoading } = useQuery<OIDCProvider[]>({
    queryKey: ["oidc-providers"],
    queryFn: () => apiFetch<OIDCProvider[]>("/oidc-providers"),
  });

  // Create provider mutation
  const createProviderMutation = useMutation({
    mutationFn: (data: CreateProviderForm) =>
      apiFetch<OIDCProvider>("/oidc-providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["oidc-providers"] });
      setCreateModalOpen(false);
      setCreateForm({
        providerId: "",
        name: "",
        issuer: "",
        discoveryUrl: "",
        domain: "",
        clientId: "",
        clientSecret: "",
        scopes: ["openid", "email", "profile", "groups"],
        allowAutoProvision: false,
        enabled: true,
        groupClaimName: "",
        adminGroupValue: "",
        defaultPermissions: {},
      });
      setShowAdvanced(false);
      setError(null);
      setTestResult(null);
    },
    onError: (error: unknown) => {
      setError(
        error instanceof Error ? error.message : "Failed to create provider",
      );
    },
  });

  // Update provider mutation
  const updateProviderMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: {
        name?: string;
        issuer?: string;
        domain?: string | null;
        enabled?: boolean;
        allowAutoProvision?: boolean;
        clientId?: string;
        clientSecret?: string;
        scopes?: string[];
        discoveryUrl?: string;
        groupClaimName?: string | null;
        adminGroupValue?: string | null;
        defaultPermissions?: DefaultPermissions | null;
      };
    }) =>
      apiFetch<OIDCProvider>(`/oidc-providers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["oidc-providers"] });
      setEditModalOpen(false);
      setSelectedProvider(null);
      setShowEditAdvanced(false);
      setError(null);
      setTestResult(null);
    },
    onError: (error: unknown) => {
      setError(
        error instanceof Error ? error.message : "Failed to update provider",
      );
    },
  });

  // Delete provider mutation
  const deleteProviderMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/oidc-providers/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["oidc-providers"] });
    },
    onError: (error: unknown) => {
      setError(
        error instanceof Error ? error.message : "Failed to delete provider",
      );
    },
  });

  const handleCreateProvider = () => {
    setError(null);
    const fullIssuer = `${createProtocol}${createForm.issuer}`;
    createProviderMutation.mutate({
      ...createForm,
      issuer: fullIssuer,
      discoveryUrl:
        createForm.discoveryUrl ||
        `${fullIssuer}/.well-known/openid-configuration`,
    });
  };

  const handleUpdateProvider = () => {
    if (!selectedProvider) return;
    setError(null);
    const fullIssuer = `${editProtocol}${selectedProvider.issuer}`;
    const updateData = {
      name: selectedProvider.name,
      issuer: fullIssuer,
      domain: selectedProvider.domain,
      enabled: selectedProvider.enabled,
      allowAutoProvision: selectedProvider.allowAutoProvision,
      // API expects these at top level, not nested in oidcConfig
      clientId: selectedProvider.oidcConfig.clientId,
      clientSecret: selectedProvider.oidcConfig.clientSecret,
      scopes: selectedProvider.oidcConfig.scopes,
      discoveryUrl:
        selectedProvider.oidcConfig.discoveryUrl ||
        `${fullIssuer}/.well-known/openid-configuration`,
      // New fields
      groupClaimName: selectedProvider.groupClaimName,
      adminGroupValue: selectedProvider.adminGroupValue,
      defaultPermissions: selectedProvider.defaultPermissions,
    };
    updateProviderMutation.mutate({
      id: selectedProvider.id,
      data: updateData,
    });
  };

  const handleDeleteProvider = (id: string) => {
    if (confirm("Are you sure you want to delete this OIDC provider?")) {
      deleteProviderMutation.mutate(id);
    }
  };

  const handleEditProvider = (provider: OIDCProvider) => {
    // Parse protocol from existing issuer
    const isHttps = provider.issuer.startsWith("https://");
    setEditProtocol(isHttps ? "https://" : "http://");
    // Store provider with issuer stripped of protocol for display
    const issuerHost = provider.issuer.replace(/^https?:\/\//, "");
    setSelectedProvider({
      ...provider,
      issuer: issuerHost,
    });
    setEditModalOpen(true);
    setError(null);
    setTestResult(null);
  };

  const handleTestConnection = async (providerId: string) => {
    setTesting(true);
    setTestResult(null);
    setError(null);

    try {
      const result = await apiFetch<TestResult>(
        `/oidc-providers/${providerId}/test`,
        {
          method: "POST",
        },
      );
      setTestResult(result);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to test connection",
      );
    } finally {
      setTesting(false);
    }
  };

  // Fetch discovery document to show the authoritative issuer
  const handleFetchDiscovery = async (discoveryUrl: string) => {
    if (!discoveryUrl) {
      setDiscoveryResult(null);
      return;
    }

    setFetchingDiscovery(true);
    setDiscoveryResult(null);

    try {
      const response = await fetch(discoveryUrl);
      if (!response.ok) {
        setDiscoveryResult({
          error: `Failed to fetch discovery document: ${response.status}`,
        });
        return;
      }
      const doc = await response.json();
      setDiscoveryResult({
        issuer: doc.issuer || "No issuer found in discovery document",
      });
    } catch (err) {
      setDiscoveryResult({
        error: err instanceof Error ? err.message : "Failed to fetch discovery",
      });
    } finally {
      setFetchingDiscovery(false);
    }
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
          <Title order={2}>OIDC Providers</Title>
          <Text c="dimmed" size="sm">
            Configure OpenID Connect identity providers
          </Text>
        </div>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => setCreateModalOpen(true)}
        >
          Add Provider
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

      {testResult && (
        <Alert
          icon={
            testResult.success ? <IconCheck size={16} /> : <IconX size={16} />
          }
          color={testResult.success ? "green" : "red"}
          title={
            testResult.success ? "Connection successful" : "Connection failed"
          }
          mb="md"
          onClose={() => setTestResult(null)}
          withCloseButton
        >
          {testResult.message}
        </Alert>
      )}

      <Card>
        <Table.ScrollContainer minWidth={600}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Provider</Table.Th>
                <Table.Th>Issuer</Table.Th>
                <Table.Th>Domain</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {providers?.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Text ta="center" c="dimmed" py="xl">
                      No OIDC providers configured. Click "Add Provider" to get
                      started.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                providers?.map((provider) => (
                  <Table.Tr key={provider.id}>
                    <Table.Td>
                      <Text fw={500}>
                        {provider.name || provider.providerId}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {provider.providerId}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" style={{ wordBreak: "break-all" }}>
                        {provider.issuer}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {provider.domain ? (
                        <Text size="sm">{provider.domain}</Text>
                      ) : (
                        <Text size="sm" c="dimmed">
                          None
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Badge color={provider.enabled ? "green" : "gray"}>
                        {provider.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Tooltip label="Test connection">
                          <ActionIcon
                            variant="subtle"
                            color="blue"
                            onClick={() => handleTestConnection(provider.id)}
                            loading={testing}
                          >
                            <IconPlugConnected size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Edit provider">
                          <ActionIcon
                            variant="subtle"
                            onClick={() => handleEditProvider(provider)}
                          >
                            <IconEdit size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Delete provider">
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            onClick={() => handleDeleteProvider(provider.id)}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>

      {/* Create Provider Modal */}
      <Modal
        opened={createModalOpen}
        onClose={() => {
          setCreateModalOpen(false);
          setError(null);
          setTestResult(null);
          setDiscoveryResult(null);
        }}
        title="Add OIDC Provider"
        size="lg"
      >
        <Stack gap="md">
          <TextInput
            label="Provider ID"
            description="Unique identifier (lowercase, numbers, hyphens only)"
            placeholder="keycloak"
            required
            value={createForm.providerId}
            onChange={(e) =>
              setCreateForm({ ...createForm, providerId: e.target.value })
            }
          />

          <TextInput
            label="Display Name"
            placeholder="Keycloak"
            value={createForm.name}
            onChange={(e) =>
              setCreateForm({ ...createForm, name: e.target.value })
            }
          />

          <Input.Wrapper
            label="Issuer URL"
            description="Base URL of your OIDC provider. The discovery endpoint will be derived automatically."
            required
          >
            <Group gap={0} mt={4}>
              <Select
                data={[
                  { value: "https://", label: "https://" },
                  { value: "http://", label: "http://" },
                ]}
                value={createProtocol}
                onChange={(value) =>
                  setCreateProtocol(
                    (value as "https://" | "http://") || "https://",
                  )
                }
                w={110}
                allowDeselect={false}
                withCheckIcon={false}
                styles={{
                  input: {
                    borderTopRightRadius: 0,
                    borderBottomRightRadius: 0,
                    borderRight: 0,
                  },
                }}
              />
              <TextInput
                placeholder="id.example.com"
                value={createForm.issuer}
                onChange={(e) => {
                  // Preserve user input as-is (including trailing slashes)
                  // The backend will use the authoritative issuer from the discovery document
                  const host = e.target.value;
                  const issuer = host ? `${createProtocol}${host}` : "";
                  setCreateForm({
                    ...createForm,
                    issuer: host,
                    discoveryUrl: issuer
                      ? `${issuer}/.well-known/openid-configuration`
                      : "",
                  });
                }}
                style={{ flex: 1 }}
                styles={{
                  input: {
                    borderTopLeftRadius: 0,
                    borderBottomLeftRadius: 0,
                  },
                }}
              />
            </Group>
          </Input.Wrapper>

          <Stack gap="xs">
            <Group align="flex-end" gap="xs">
              <TextInput
                label="Discovery URL"
                description="Auto-derived from Issuer URL. Override only if your provider uses a non-standard path."
                placeholder="https://id.example.com/.well-known/openid-configuration"
                value={createForm.discoveryUrl}
                onChange={(e) => {
                  setCreateForm({
                    ...createForm,
                    discoveryUrl: e.target.value,
                  });
                  setDiscoveryResult(null);
                }}
                style={{ flex: 1 }}
              />
              <Button
                variant="light"
                onClick={() => handleFetchDiscovery(createForm.discoveryUrl)}
                loading={fetchingDiscovery}
                disabled={!createForm.discoveryUrl}
              >
                Test Discovery
              </Button>
            </Group>
            {discoveryResult && (
              <Alert
                icon={
                  discoveryResult.error ? (
                    <IconAlertCircle size={16} />
                  ) : (
                    <IconCheck size={16} />
                  )
                }
                color={discoveryResult.error ? "red" : "teal"}
                title={
                  discoveryResult.error
                    ? "Discovery Failed"
                    : "Discovered Issuer"
                }
              >
                <Text size="sm" style={{ wordBreak: "break-all" }}>
                  {discoveryResult.error || discoveryResult.issuer}
                </Text>
                {discoveryResult.issuer && (
                  <Text size="xs" c="dimmed" mt="xs">
                    This is the authoritative issuer URL that will be stored and
                    used for token validation.
                  </Text>
                )}
              </Alert>
            )}
          </Stack>

          <TextInput
            label="Domain (Optional)"
            description="Auto-route users with this email domain to this provider"
            placeholder="example.com"
            value={createForm.domain}
            onChange={(e) =>
              setCreateForm({ ...createForm, domain: e.target.value })
            }
          />

          <TextInput
            label="Client ID"
            placeholder="ephemera-client"
            required
            value={createForm.clientId}
            onChange={(e) =>
              setCreateForm({ ...createForm, clientId: e.target.value })
            }
          />

          <TextInput
            label="Client Secret"
            type="password"
            placeholder="••••••••"
            required
            value={createForm.clientSecret}
            onChange={(e) =>
              setCreateForm({ ...createForm, clientSecret: e.target.value })
            }
          />

          <TagsInput
            label="Scopes"
            description="OAuth scopes to request. Type to add custom scopes."
            data={["openid", "email", "profile", "groups", "offline_access"]}
            value={createForm.scopes}
            onChange={(value) =>
              setCreateForm({ ...createForm, scopes: value })
            }
            placeholder="Add scope..."
            splitChars={[",", " "]}
          />

          <Switch
            label="Allow auto-provisioning"
            description="Automatically create accounts for new users. If disabled, users must exist before they can sign in."
            checked={createForm.allowAutoProvision}
            onChange={(e) =>
              setCreateForm({
                ...createForm,
                allowAutoProvision: e.currentTarget.checked,
              })
            }
          />

          <Switch
            label="Enable provider"
            description="Users can sign in with this provider"
            checked={createForm.enabled}
            onChange={(e) =>
              setCreateForm({ ...createForm, enabled: e.currentTarget.checked })
            }
          />

          {/* Advanced Options */}
          <Button
            variant="subtle"
            size="sm"
            leftSection={
              showAdvanced ? (
                <IconChevronUp size={16} />
              ) : (
                <IconChevronDown size={16} />
              )
            }
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? "Hide" : "Show"} Advanced Options
          </Button>

          {showAdvanced && (
            <Card withBorder p="md">
              <Text size="sm" fw={500}>
                Auto-Admin from Group Claims
              </Text>
              <Text size="xs" c="dimmed" mb="md">
                Automatically grant admin role to users who have a specific
                group claim in their OIDC token. The role will sync on each
                login (users can be promoted or demoted based on IdP groups).
              </Text>

              <TextInput
                label="Group Claim Name"
                description="Name of the claim containing user groups (e.g., groups, roles, memberOf)"
                placeholder="groups"
                value={createForm.groupClaimName}
                onChange={(e) =>
                  setCreateForm({
                    ...createForm,
                    groupClaimName: e.target.value,
                  })
                }
              />

              <TextInput
                label="Admin Group Value"
                description="Users with this group will be granted admin role"
                placeholder="ephemera-admins"
                mt="sm"
                value={createForm.adminGroupValue}
                onChange={(e) =>
                  setCreateForm({
                    ...createForm,
                    adminGroupValue: e.target.value,
                  })
                }
              />

              <Text size="sm" fw={500} mt="lg">
                Default Permissions for New Users
              </Text>
              <Text size="xs" c="dimmed" mb="md">
                Override the default permissions for users created via this
                provider. Unset options will use global defaults.
              </Text>

              <Stack gap="xs">
                <Group grow>
                  <Switch
                    label="Can manage requests"
                    checked={
                      createForm.defaultPermissions?.canManageRequests ?? true
                    }
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        defaultPermissions: {
                          ...createForm.defaultPermissions,
                          canManageRequests: e.currentTarget.checked,
                        },
                      })
                    }
                  />
                  <Switch
                    label="Can start downloads"
                    checked={
                      createForm.defaultPermissions?.canStartDownloads ?? true
                    }
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        defaultPermissions: {
                          ...createForm.defaultPermissions,
                          canStartDownloads: e.currentTarget.checked,
                        },
                      })
                    }
                  />
                </Group>

                <Group grow>
                  <Switch
                    label="Can delete downloads"
                    checked={
                      createForm.defaultPermissions?.canDeleteDownloads ?? false
                    }
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        defaultPermissions: {
                          ...createForm.defaultPermissions,
                          canDeleteDownloads: e.currentTarget.checked,
                        },
                      })
                    }
                  />
                  <Switch
                    label="Can manage lists"
                    checked={
                      createForm.defaultPermissions?.canManageLists ?? true
                    }
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        defaultPermissions: {
                          ...createForm.defaultPermissions,
                          canManageLists: e.currentTarget.checked,
                        },
                      })
                    }
                  />
                </Group>

                <Group grow>
                  <Switch
                    label="Can configure Tolino"
                    checked={
                      createForm.defaultPermissions?.canConfigureTolino ?? true
                    }
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        defaultPermissions: {
                          ...createForm.defaultPermissions,
                          canConfigureTolino: e.currentTarget.checked,
                        },
                      })
                    }
                  />
                  <Switch
                    label="Can see download owner"
                    checked={
                      createForm.defaultPermissions?.canSeeDownloadOwner ??
                      false
                    }
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        defaultPermissions: {
                          ...createForm.defaultPermissions,
                          canSeeDownloadOwner: e.currentTarget.checked,
                        },
                      })
                    }
                  />
                </Group>

                <Group grow>
                  <Switch
                    label="Can configure notifications"
                    checked={
                      createForm.defaultPermissions
                        ?.canConfigureNotifications ?? false
                    }
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        defaultPermissions: {
                          ...createForm.defaultPermissions,
                          canConfigureNotifications: e.currentTarget.checked,
                        },
                      })
                    }
                  />
                  <Switch
                    label="Can manage API keys"
                    checked={
                      createForm.defaultPermissions?.canManageApiKeys ?? false
                    }
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        defaultPermissions: {
                          ...createForm.defaultPermissions,
                          canManageApiKeys: e.currentTarget.checked,
                        },
                      })
                    }
                  />
                </Group>

                <Group grow>
                  <Switch
                    label="Can configure app"
                    checked={
                      createForm.defaultPermissions?.canConfigureApp ?? false
                    }
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        defaultPermissions: {
                          ...createForm.defaultPermissions,
                          canConfigureApp: e.currentTarget.checked,
                        },
                      })
                    }
                  />
                  <Switch
                    label="Can configure integrations"
                    checked={
                      createForm.defaultPermissions?.canConfigureIntegrations ??
                      false
                    }
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        defaultPermissions: {
                          ...createForm.defaultPermissions,
                          canConfigureIntegrations: e.currentTarget.checked,
                        },
                      })
                    }
                  />
                </Group>

                <Group grow>
                  <Switch
                    label="Can configure email"
                    checked={
                      createForm.defaultPermissions?.canConfigureEmail ?? false
                    }
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        defaultPermissions: {
                          ...createForm.defaultPermissions,
                          canConfigureEmail: e.currentTarget.checked,
                        },
                      })
                    }
                  />
                  <Box />
                </Group>
              </Stack>
            </Card>
          )}

          {testResult && (
            <Alert
              icon={
                testResult.success ? (
                  <IconCheck size={16} />
                ) : (
                  <IconX size={16} />
                )
              }
              color={testResult.success ? "green" : "red"}
              title={
                testResult.success
                  ? "Connection successful"
                  : "Connection failed"
              }
            >
              {testResult.message}
            </Alert>
          )}

          <Group justify="flex-end" mt="md">
            <Button
              variant="default"
              onClick={() => {
                setCreateModalOpen(false);
                setError(null);
                setTestResult(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateProvider}
              loading={createProviderMutation.isPending}
            >
              Create Provider
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Edit Provider Modal */}
      <Modal
        opened={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setSelectedProvider(null);
          setError(null);
          setTestResult(null);
        }}
        title="Edit OIDC Provider"
        size="lg"
      >
        {selectedProvider && (
          <Stack gap="md">
            <TextInput
              label="Display Name"
              placeholder="Keycloak"
              value={selectedProvider.name || ""}
              onChange={(e) =>
                setSelectedProvider({
                  ...selectedProvider,
                  name: e.target.value,
                })
              }
            />

            <Input.Wrapper
              label="Issuer URL"
              description="Base URL of your OIDC provider"
            >
              <Group gap={0} mt={4}>
                <Select
                  data={[
                    { value: "https://", label: "https://" },
                    { value: "http://", label: "http://" },
                  ]}
                  value={editProtocol}
                  onChange={(value) =>
                    setEditProtocol(
                      (value as "https://" | "http://") || "https://",
                    )
                  }
                  w={110}
                  allowDeselect={false}
                  withCheckIcon={false}
                  styles={{
                    input: {
                      borderTopRightRadius: 0,
                      borderBottomRightRadius: 0,
                      borderRight: 0,
                    },
                  }}
                />
                <TextInput
                  placeholder="id.example.com"
                  value={selectedProvider.issuer}
                  onChange={(e) => {
                    // Preserve user input as-is (including trailing slashes)
                    // The backend will use the authoritative issuer from the discovery document
                    const host = e.target.value;
                    const fullIssuer = host ? `${editProtocol}${host}` : "";
                    setSelectedProvider({
                      ...selectedProvider,
                      issuer: host,
                      oidcConfig: {
                        ...selectedProvider.oidcConfig,
                        discoveryUrl: fullIssuer
                          ? `${fullIssuer}/.well-known/openid-configuration`
                          : "",
                      },
                    });
                  }}
                  style={{ flex: 1 }}
                  styles={{
                    input: {
                      borderTopLeftRadius: 0,
                      borderBottomLeftRadius: 0,
                    },
                  }}
                />
              </Group>
            </Input.Wrapper>

            <TextInput
              label="Discovery URL"
              description="Override only if your provider uses a non-standard path"
              value={selectedProvider.oidcConfig.discoveryUrl || ""}
              onChange={(e) =>
                setSelectedProvider({
                  ...selectedProvider,
                  oidcConfig: {
                    ...selectedProvider.oidcConfig,
                    discoveryUrl: e.target.value,
                  },
                })
              }
            />

            <TextInput
              label="Domain (Optional)"
              value={selectedProvider.domain || ""}
              onChange={(e) =>
                setSelectedProvider({
                  ...selectedProvider,
                  domain: e.target.value || null,
                })
              }
            />

            <TextInput
              label="Client ID"
              value={selectedProvider.oidcConfig.clientId}
              onChange={(e) =>
                setSelectedProvider({
                  ...selectedProvider,
                  oidcConfig: {
                    ...selectedProvider.oidcConfig,
                    clientId: e.target.value,
                  },
                })
              }
            />

            <TextInput
              label="Client Secret"
              type="password"
              placeholder="••••••••"
              value={selectedProvider.oidcConfig.clientSecret}
              onChange={(e) =>
                setSelectedProvider({
                  ...selectedProvider,
                  oidcConfig: {
                    ...selectedProvider.oidcConfig,
                    clientSecret: e.target.value,
                  },
                })
              }
            />

            <TagsInput
              label="Scopes"
              description="OAuth scopes to request. Type to add custom scopes."
              data={["openid", "email", "profile", "groups", "offline_access"]}
              value={selectedProvider.oidcConfig.scopes}
              onChange={(value) =>
                setSelectedProvider({
                  ...selectedProvider,
                  oidcConfig: {
                    ...selectedProvider.oidcConfig,
                    scopes: value,
                  },
                })
              }
              placeholder="Add scope..."
              splitChars={[",", " "]}
            />

            <Switch
              label="Allow auto-provisioning"
              description="Automatically create accounts for new users. If disabled, users must exist before they can sign in."
              checked={selectedProvider.allowAutoProvision}
              onChange={(e) =>
                setSelectedProvider({
                  ...selectedProvider,
                  allowAutoProvision: e.currentTarget.checked,
                })
              }
            />

            <Switch
              label="Enable provider"
              checked={selectedProvider.enabled}
              onChange={(e) =>
                setSelectedProvider({
                  ...selectedProvider,
                  enabled: e.currentTarget.checked,
                })
              }
            />

            {/* Advanced Options */}
            <Button
              variant="subtle"
              size="sm"
              leftSection={
                showEditAdvanced ? (
                  <IconChevronUp size={16} />
                ) : (
                  <IconChevronDown size={16} />
                )
              }
              onClick={() => setShowEditAdvanced(!showEditAdvanced)}
            >
              {showEditAdvanced ? "Hide" : "Show"} Advanced Options
            </Button>

            {showEditAdvanced && (
              <Card withBorder p="md">
                <Text size="sm" fw={500}>
                  Auto-Admin from Group Claims
                </Text>
                <Text size="xs" c="dimmed" mb="md">
                  Automatically grant admin role to users who have a specific
                  group claim in their OIDC token. The role will sync on each
                  login (users can be promoted or demoted based on IdP groups).
                </Text>

                <TextInput
                  label="Group Claim Name"
                  description="Name of the claim containing user groups (e.g., groups, roles, memberOf)"
                  placeholder="groups"
                  value={selectedProvider.groupClaimName || ""}
                  onChange={(e) =>
                    setSelectedProvider({
                      ...selectedProvider,
                      groupClaimName: e.target.value || null,
                    })
                  }
                />

                <TextInput
                  label="Admin Group Value"
                  description="Users with this group will be granted admin role"
                  placeholder="ephemera-admins"
                  mt="sm"
                  value={selectedProvider.adminGroupValue || ""}
                  onChange={(e) =>
                    setSelectedProvider({
                      ...selectedProvider,
                      adminGroupValue: e.target.value || null,
                    })
                  }
                />

                <Text size="sm" fw={500} mt="lg">
                  Default Permissions for New Users
                </Text>
                <Text size="xs" c="dimmed" mb="md">
                  Override the default permissions for users created via this
                  provider. Unset options will use global defaults.
                </Text>

                <Stack gap="xs">
                  <Group grow>
                    <Switch
                      label="Can manage requests"
                      checked={
                        selectedProvider.defaultPermissions
                          ?.canManageRequests ?? true
                      }
                      onChange={(e) =>
                        setSelectedProvider({
                          ...selectedProvider,
                          defaultPermissions: {
                            ...selectedProvider.defaultPermissions,
                            canManageRequests: e.currentTarget.checked,
                          },
                        })
                      }
                    />
                    <Switch
                      label="Can start downloads"
                      checked={
                        selectedProvider.defaultPermissions
                          ?.canStartDownloads ?? true
                      }
                      onChange={(e) =>
                        setSelectedProvider({
                          ...selectedProvider,
                          defaultPermissions: {
                            ...selectedProvider.defaultPermissions,
                            canStartDownloads: e.currentTarget.checked,
                          },
                        })
                      }
                    />
                  </Group>

                  <Group grow>
                    <Switch
                      label="Can delete downloads"
                      checked={
                        selectedProvider.defaultPermissions
                          ?.canDeleteDownloads ?? false
                      }
                      onChange={(e) =>
                        setSelectedProvider({
                          ...selectedProvider,
                          defaultPermissions: {
                            ...selectedProvider.defaultPermissions,
                            canDeleteDownloads: e.currentTarget.checked,
                          },
                        })
                      }
                    />
                    <Switch
                      label="Can manage lists"
                      checked={
                        selectedProvider.defaultPermissions?.canManageLists ??
                        true
                      }
                      onChange={(e) =>
                        setSelectedProvider({
                          ...selectedProvider,
                          defaultPermissions: {
                            ...selectedProvider.defaultPermissions,
                            canManageLists: e.currentTarget.checked,
                          },
                        })
                      }
                    />
                  </Group>

                  <Group grow>
                    <Switch
                      label="Can configure Tolino"
                      checked={
                        selectedProvider.defaultPermissions
                          ?.canConfigureTolino ?? true
                      }
                      onChange={(e) =>
                        setSelectedProvider({
                          ...selectedProvider,
                          defaultPermissions: {
                            ...selectedProvider.defaultPermissions,
                            canConfigureTolino: e.currentTarget.checked,
                          },
                        })
                      }
                    />
                    <Switch
                      label="Can see download owner"
                      checked={
                        selectedProvider.defaultPermissions
                          ?.canSeeDownloadOwner ?? false
                      }
                      onChange={(e) =>
                        setSelectedProvider({
                          ...selectedProvider,
                          defaultPermissions: {
                            ...selectedProvider.defaultPermissions,
                            canSeeDownloadOwner: e.currentTarget.checked,
                          },
                        })
                      }
                    />
                  </Group>

                  <Group grow>
                    <Switch
                      label="Can configure notifications"
                      checked={
                        selectedProvider.defaultPermissions
                          ?.canConfigureNotifications ?? false
                      }
                      onChange={(e) =>
                        setSelectedProvider({
                          ...selectedProvider,
                          defaultPermissions: {
                            ...selectedProvider.defaultPermissions,
                            canConfigureNotifications: e.currentTarget.checked,
                          },
                        })
                      }
                    />
                    <Switch
                      label="Can manage API keys"
                      checked={
                        selectedProvider.defaultPermissions?.canManageApiKeys ??
                        false
                      }
                      onChange={(e) =>
                        setSelectedProvider({
                          ...selectedProvider,
                          defaultPermissions: {
                            ...selectedProvider.defaultPermissions,
                            canManageApiKeys: e.currentTarget.checked,
                          },
                        })
                      }
                    />
                  </Group>

                  <Group grow>
                    <Switch
                      label="Can configure app"
                      checked={
                        selectedProvider.defaultPermissions?.canConfigureApp ??
                        false
                      }
                      onChange={(e) =>
                        setSelectedProvider({
                          ...selectedProvider,
                          defaultPermissions: {
                            ...selectedProvider.defaultPermissions,
                            canConfigureApp: e.currentTarget.checked,
                          },
                        })
                      }
                    />
                    <Switch
                      label="Can configure integrations"
                      checked={
                        selectedProvider.defaultPermissions
                          ?.canConfigureIntegrations ?? false
                      }
                      onChange={(e) =>
                        setSelectedProvider({
                          ...selectedProvider,
                          defaultPermissions: {
                            ...selectedProvider.defaultPermissions,
                            canConfigureIntegrations: e.currentTarget.checked,
                          },
                        })
                      }
                    />
                  </Group>

                  <Group grow>
                    <Switch
                      label="Can configure email"
                      checked={
                        selectedProvider.defaultPermissions
                          ?.canConfigureEmail ?? false
                      }
                      onChange={(e) =>
                        setSelectedProvider({
                          ...selectedProvider,
                          defaultPermissions: {
                            ...selectedProvider.defaultPermissions,
                            canConfigureEmail: e.currentTarget.checked,
                          },
                        })
                      }
                    />
                    <Box />
                  </Group>
                </Stack>
              </Card>
            )}

            {testResult && (
              <Alert
                icon={
                  testResult.success ? (
                    <IconCheck size={16} />
                  ) : (
                    <IconX size={16} />
                  )
                }
                color={testResult.success ? "green" : "red"}
                title={
                  testResult.success
                    ? "Connection successful"
                    : "Connection failed"
                }
              >
                {testResult.message}
              </Alert>
            )}

            <Group justify="space-between" mt="md">
              <Button
                variant="outline"
                leftSection={<IconPlugConnected size={16} />}
                onClick={() => handleTestConnection(selectedProvider.id)}
                loading={testing}
              >
                Test Connection
              </Button>
              <Group>
                <Button
                  variant="default"
                  onClick={() => {
                    setEditModalOpen(false);
                    setSelectedProvider(null);
                    setError(null);
                    setTestResult(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUpdateProvider}
                  loading={updateProviderMutation.isPending}
                >
                  Save Changes
                </Button>
              </Group>
            </Group>
          </Stack>
        )}
      </Modal>
    </Box>
  );
}

export default OIDCProvidersPage;
