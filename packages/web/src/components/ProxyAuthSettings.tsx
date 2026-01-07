import { useState, useEffect } from "react";
import { useTranslation, Trans } from "react-i18next";
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
  const { t } = useTranslation("translation", {
    keyPrefix: "settings.proxy_auth",
  });
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
                  {t("title")}
                </Group>
              </Title>
              <Text size="sm" c="dimmed">
                {t("description")}
              </Text>
            </div>
            <Switch
              checked={enabled}
              onChange={(e) => setEnabled(e.currentTarget.checked)}
              label={t("enabled")}
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
                {t("security_warning.title")}
              </Text>
              <Text size="sm">{t("security_warning.message")}</Text>
              <List size="sm" spacing="xs">
                <List.Item>
                  {t("security_warning.list.trusted_proxy")}
                </List.Item>
                <List.Item>
                  {t("security_warning.list.strips_header")}
                </List.Item>
                <List.Item>{t("security_warning.list.sets_header")}</List.Item>
                <List.Item>
                  {t("security_warning.list.blocked_direct")}
                </List.Item>
              </List>
              <Text size="sm" c="dimmed" mt="xs">
                {t("security_warning.api_notice")}
              </Text>
            </Stack>
          </Alert>

          {/* Configuration Fields */}
          <Stack gap="sm">
            <TextInput
              label={t("form.header_name.label")}
              description={t("form.header_name.description")}
              placeholder="Remote-User"
              value={headerName}
              onChange={(e) => setHeaderName(e.target.value)}
              error={
                headerName && !headerNameValid
                  ? t("form.header_name.error")
                  : undefined
              }
              required
            />
            <Text size="xs" c="dimmed">
              <Trans
                t={t}
                i18nKey="proxy_auth.form.header_name.common"
                components={[
                  <Code key="0">Remote-User</Code>,
                  <Code key="1">X-Forwarded-User</Code>,
                  <Code key="2">X-Authentik-Username</Code>,
                  <Code key="3">X-Authelia-Username</Code>,
                ]}
              />
            </Text>

            <Select
              label={t("form.user_identifier.label")}
              description={t("form.user_identifier.description")}
              data={[
                {
                  value: "email",
                  label: t("form.user_identifier.options.email"),
                },
                {
                  value: "username",
                  label: t("form.user_identifier.options.username"),
                },
              ]}
              value={userIdentifier}
              onChange={(v) =>
                setUserIdentifier((v as ProxyAuthUserIdentifier) || "email")
              }
            />

            <Textarea
              label={t("form.trusted_proxies.label")}
              description={t("form.trusted_proxies.description")}
              placeholder="172.17.0.1, 10.0.0.0/8, 192.168.1.100"
              value={trustedProxies}
              onChange={(e) => setTrustedProxies(e.target.value)}
              minRows={2}
              required
              error={
                enabled && !trustedProxiesValid
                  ? t("form.trusted_proxies.error")
                  : undefined
              }
            />
            <Text size="xs" c="dimmed">
              <Trans
                t={t}
                i18nKey="proxy_auth.form.trusted_proxies.examples"
                components={[
                  <Code key="0">172.17.0.1</Code>,
                  <Code key="1">10.0.0.0/8</Code>,
                  <Code key="2">192.168.0.0/16</Code>,
                ]}
              />
            </Text>

            <TextInput
              label={t("form.logout_url.label")}
              description={t("form.logout_url.description")}
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
                <Trans
                  t={t}
                  i18nKey="proxy_auth.status.enabled"
                  values={{ header: settings.headerName }}
                  components={[
                    <Text key="0" component="span" fw={600}>
                      enabled
                    </Text>,
                    <Code key="1">{settings.headerName}</Code>,
                  ]}
                />
              </Text>
            </Alert>
          )}

          {/* How it works */}
          <Alert icon={<IconShieldCheck size={16} />} color="blue">
            <Stack gap="xs">
              <Text size="sm" fw={600}>
                {t("how_it_works.title")}
              </Text>
              <List size="sm" spacing="xs">
                <List.Item>{t("how_it_works.list.visits")}</List.Item>
                <List.Item>{t("how_it_works.list.authenticates")}</List.Item>
                <List.Item>
                  <Trans
                    t={t}
                    i18nKey="proxy_auth.how_it_works.list.adds_header"
                    values={{
                      header: headerName || "Remote-User",
                      identifier:
                        userIdentifier === "email"
                          ? t("form.user_identifier.options.email")
                          : t("form.user_identifier.options.username"),
                    }}
                    components={[
                      <Code key="0">{headerName || "Remote-User"}</Code>,
                    ]}
                  />
                </List.Item>
                <List.Item>{t("how_it_works.list.validates")}</List.Item>
                <List.Item>{t("how_it_works.list.session")}</List.Item>
              </List>
              <Text size="sm" c="dimmed" mt="xs">
                {t("how_it_works.no_provisioning")}
              </Text>
            </Stack>
          </Alert>

          <Group justify="flex-end">
            <Button
              onClick={handleSave}
              disabled={!hasChanges || (enabled && !canEnable)}
              loading={updateSettings.isPending}
            >
              {t("save_button")}
            </Button>
          </Group>
        </Stack>
      </Paper>
    </Stack>
  );
}
