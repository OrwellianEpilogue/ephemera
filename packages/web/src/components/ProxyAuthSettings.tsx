import { useState, useEffect } from "react";
import {
  Stack,
  Paper,
  Title,
  Text,
  Switch,
  TextInput,
  Textarea,
  Select,
  Alert,
  Button,
  Group,
  Code,
  List,
} from "@mantine/core";
import { IconAlertTriangle, IconShieldCheck } from "@tabler/icons-react";
import {
  useProxyAuthSettings,
  useUpdateProxyAuthSettings,
} from "../hooks/use-proxy-auth-settings";
import type { ProxyAuthUserIdentifier } from "@ephemera/shared";

export default function ProxyAuthSettings() {
  const { data: settings, isLoading } = useProxyAuthSettings();
  const updateSettings = useUpdateProxyAuthSettings();

  // Form state
  const [enabled, setEnabled] = useState(false);
  const [headerName, setHeaderName] = useState("Remote-User");
  const [userIdentifier, setUserIdentifier] =
    useState<ProxyAuthUserIdentifier>("email");
  const [trustedProxies, setTrustedProxies] = useState("");
  const [logoutRedirectUrl, setLogoutRedirectUrl] = useState("");

  // Sync form state with fetched settings
  useEffect(() => {
    if (settings) {
      setEnabled(settings.enabled);
      setHeaderName(settings.headerName);
      setUserIdentifier(settings.userIdentifier);
      setTrustedProxies(settings.trustedProxies);
      setLogoutRedirectUrl(settings.logoutRedirectUrl || "");
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings.mutate({
      enabled,
      headerName,
      userIdentifier,
      trustedProxies,
      logoutRedirectUrl: logoutRedirectUrl || null,
    });
  };

  const hasChanges =
    settings &&
    (settings.enabled !== enabled ||
      settings.headerName !== headerName ||
      settings.userIdentifier !== userIdentifier ||
      settings.trustedProxies !== trustedProxies ||
      (settings.logoutRedirectUrl || "") !== logoutRedirectUrl);

  // Validation
  const headerNameValid =
    headerName.length > 0 && /^[a-zA-Z][a-zA-Z0-9-]*$/.test(headerName);
  const trustedProxiesValid = trustedProxies.trim().length > 0;
  const canEnable = trustedProxiesValid && headerNameValid;

  if (isLoading) {
    return null;
  }

  return (
    <Stack gap="lg">
      <Paper p="md" withBorder>
        <Stack gap="md">
          <Group justify="space-between">
            <div>
              <Title order={3}>
                <Group gap="xs">
                  <IconShieldCheck size={24} />
                  Reverse Proxy Authentication
                </Group>
              </Title>
              <Text size="sm" c="dimmed">
                Authenticate users via trusted proxy headers (Authelia,
                Authentik, Traefik, etc.)
              </Text>
            </div>
            <Switch
              checked={enabled}
              onChange={(e) => setEnabled(e.currentTarget.checked)}
              label="Enabled"
              size="lg"
              disabled={!canEnable && !enabled}
            />
          </Group>

          {/* Security Warning - Always visible */}
          <Alert
            icon={<IconAlertTriangle size={20} />}
            color="red"
            variant="light"
          >
            <Stack gap="xs">
              <Text size="sm" fw={600}>
                Security Warning - Read Before Enabling
              </Text>
              <Text size="sm">
                This feature allows bypassing normal authentication using HTTP
                headers. Only enable if:
              </Text>
              <List size="sm" spacing="xs">
                <List.Item>
                  Your application is ONLY accessible through a trusted reverse
                  proxy
                </List.Item>
                <List.Item>
                  The proxy strips the auth header from ALL incoming external
                  requests
                </List.Item>
                <List.Item>
                  The proxy only sets the header after successful authentication
                </List.Item>
                <List.Item>
                  Direct access to this application is blocked at the network
                  level
                </List.Item>
              </List>
              <Text size="sm" c="dimmed" mt="xs">
                API endpoints are NOT affected by proxy auth for security
                reasons. Only the web UI uses header authentication.
              </Text>
            </Stack>
          </Alert>

          {/* Configuration Fields */}
          <Stack gap="sm">
            <TextInput
              label="Header Name"
              description="HTTP header containing the authenticated username or email"
              placeholder="Remote-User"
              value={headerName}
              onChange={(e) => setHeaderName(e.target.value)}
              error={
                headerName && !headerNameValid
                  ? "Header name must start with a letter and contain only letters, numbers, and hyphens"
                  : undefined
              }
              required
            />
            <Text size="xs" c="dimmed">
              Common headers: <Code>Remote-User</Code>,{" "}
              <Code>X-Forwarded-User</Code>, <Code>X-Authentik-Username</Code>,{" "}
              <Code>X-Authelia-Username</Code>
            </Text>

            <Select
              label="User Identifier"
              description="How to match the header value to users in the system"
              data={[
                {
                  value: "email",
                  label: "Email Address",
                },
                {
                  value: "username",
                  label: "Username (name field)",
                },
              ]}
              value={userIdentifier}
              onChange={(v) =>
                setUserIdentifier((v as ProxyAuthUserIdentifier) || "email")
              }
            />

            <Textarea
              label="Trusted Proxy IPs"
              description="Comma-separated list of IP addresses or CIDR ranges allowed to send authentication headers"
              placeholder="172.17.0.1, 10.0.0.0/8, 192.168.1.100"
              value={trustedProxies}
              onChange={(e) => setTrustedProxies(e.target.value)}
              minRows={2}
              required
              error={
                enabled && !trustedProxiesValid
                  ? "At least one trusted proxy IP is required"
                  : undefined
              }
            />
            <Text size="xs" c="dimmed">
              Examples: <Code>172.17.0.1</Code> (single IP),{" "}
              <Code>10.0.0.0/8</Code> (CIDR range), <Code>192.168.0.0/16</Code>{" "}
              (private network)
            </Text>

            <TextInput
              label="Logout Redirect URL (Optional)"
              description="URL to redirect users to after logout (e.g., your proxy's logout endpoint)"
              placeholder="https://auth.example.com/logout"
              value={logoutRedirectUrl}
              onChange={(e) => setLogoutRedirectUrl(e.target.value)}
            />
          </Stack>

          {/* Status Info */}
          {settings?.enabled && (
            <Alert
              icon={<IconShieldCheck size={16} />}
              color="green"
              variant="light"
            >
              <Text size="sm">
                Proxy authentication is currently{" "}
                <Text component="span" fw={600}>
                  enabled
                </Text>
                . Users connecting from trusted proxies with the{" "}
                <Code>{settings.headerName}</Code> header will be automatically
                authenticated.
              </Text>
            </Alert>
          )}

          {/* How it works */}
          <Alert icon={<IconShieldCheck size={16} />} color="blue">
            <Stack gap="xs">
              <Text size="sm" fw={600}>
                How Proxy Authentication Works
              </Text>
              <List size="sm" spacing="xs">
                <List.Item>
                  User visits your app through the reverse proxy
                </List.Item>
                <List.Item>
                  Proxy authenticates user (via Authelia, Authentik, etc.)
                </List.Item>
                <List.Item>
                  Proxy adds the <Code>{headerName || "Remote-User"}</Code>{" "}
                  header with the authenticated user's{" "}
                  {userIdentifier === "email" ? "email" : "username"}
                </List.Item>
                <List.Item>
                  This app validates the request IP and looks up the user
                </List.Item>
                <List.Item>
                  A session cookie is created and the user is logged in
                </List.Item>
              </List>
              <Text size="sm" c="dimmed" mt="xs">
                Users must already exist in the system - no auto-provisioning.
              </Text>
            </Stack>
          </Alert>

          <Group justify="flex-end">
            <Button
              onClick={handleSave}
              disabled={!hasChanges || (enabled && !canEnable)}
              loading={updateSettings.isPending}
            >
              Save Settings
            </Button>
          </Group>
        </Stack>
      </Paper>
    </Stack>
  );
}
