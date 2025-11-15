import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Box,
  Button,
  Container,
  Paper,
  PasswordInput,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
  Alert,
  Loader,
  Center,
} from "@mantine/core";
import {
  IconMail,
  IconLock,
  IconAlertCircle,
  IconBook,
  IconDatabase,
  IconPlugConnected,
} from "@tabler/icons-react";
import { signIn, authClient } from "../lib/auth-client";
import { useAuth } from "../hooks/useAuth";
import { apiFetch } from "@ephemera/shared";

interface OIDCProvider {
  id: string;
  providerId: string;
  name?: string;
  issuer: string;
  enabled: boolean;
}

interface AuthMethods {
  password: boolean;
  booklore: boolean;
  calibre: boolean;
  oauth2: boolean;
}

function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  // Check if setup is complete and load OIDC providers
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [oidcProviders, setOidcProviders] = useState<OIDCProvider[]>([]);
  const [authMethods, setAuthMethods] = useState<AuthMethods>({
    password: true,
    booklore: false,
    calibre: false,
    oauth2: false,
  });

  useEffect(() => {
    async function checkSetup() {
      try {
        const response = await fetch("/api/setup/status");
        const data = await response.json();

        if (!data.isSetupComplete) {
          // Redirect to setup wizard
          navigate({ to: "/setup" });
          return;
        }

        // Load available auth methods
        try {
          const methods = await apiFetch<AuthMethods>("/auth/methods");
          setAuthMethods(methods);
        } catch (err) {
          console.warn("Could not load auth methods:", err);
          // Fallback to password-only if fetch fails
          setAuthMethods({
            password: true,
            booklore: false,
            calibre: false,
            oauth2: false,
          });
        }

        // Load OIDC providers (public endpoint, no auth needed)
        try {
          const providers = await apiFetch<OIDCProvider[]>("/oidc-providers");
          // Only show enabled providers
          setOidcProviders(providers.filter((p) => p.enabled));
        } catch (err) {
          // If endpoint fails, just continue without OIDC providers
          console.warn("Could not load OIDC providers:", err);
        }
      } catch (error) {
        console.error("Error checking setup status:", error);
      } finally {
        setCheckingSetup(false);
      }
    }

    checkSetup();
  }, [navigate]);

  // Form states for different auth methods
  const [emailForm, setEmailForm] = useState({ email: "", password: "" });
  const [bookloreForm, setBookloreForm] = useState({
    username: "",
    password: "",
  });
  const [calibreForm, setCalibreForm] = useState({
    username: "",
    password: "",
  });

  // UI states
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-select first available tab when auth methods are loaded
  useEffect(() => {
    if (activeTab === null) {
      if (authMethods.password) {
        setActiveTab("email");
      } else if (authMethods.booklore) {
        setActiveTab("booklore");
      } else if (authMethods.calibre) {
        setActiveTab("calibre");
      } else if (authMethods.oauth2) {
        setActiveTab("oidc");
      }
    }
  }, [authMethods, activeTab]);

  // Show loading while checking setup
  if (checkingSetup) {
    return (
      <Center h="100vh">
        <Stack align="center" gap="md">
          <Loader size="lg" />
          <Text c="dimmed">Checking setup...</Text>
        </Stack>
      </Center>
    );
  }

  // Redirect if already authenticated
  if (isAuthenticated) {
    navigate({ to: "/" });
    return null;
  }

  // Email/Password sign in
  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await signIn.email({
        email: emailForm.email,
        password: emailForm.password,
        callbackURL: "/",
      });

      if (result.error) {
        setError(result.error.message || "Login failed");
      } else {
        // Successful login, navigate to home
        navigate({ to: "/" });
      }
    } catch (err) {
      console.error("[Login] Email sign in error:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  // Booklore sign in
  const handleBookloreSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Use authClient fetch directly for custom credential providers
      const response = await fetch("/api/auth/sign-in/booklore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: bookloreForm.username,
          password: bookloreForm.password,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        setError(error.message || "Booklore login failed");
      } else {
        navigate({ to: "/" });
      }
    } catch (err) {
      console.error("[Login] Booklore sign in error:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  // Calibre-Web sign in
  const handleCalibreSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Use authClient fetch directly for custom credential providers
      const response = await fetch("/api/auth/sign-in/calibre", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: calibreForm.username,
          password: calibreForm.password,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        setError(error.message || "Calibre-Web login failed");
      } else {
        navigate({ to: "/" });
      }
    } catch (err) {
      console.error("[Login] Calibre sign in error:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  // OIDC sign in
  const handleOIDCSignIn = async (providerId: string) => {
    setError(null);
    setLoading(true);

    try {
      // Use the SSO client from Better Auth
      await authClient.signIn.sso({
        providerId,
        callbackURL: "/",
      });
      // OIDC flow will redirect automatically
    } catch (err) {
      console.error(`[Login] OIDC sign in error:`, err);
      setError(err instanceof Error ? err.message : "OIDC login failed");
      setLoading(false);
    }
  };

  return (
    <Box
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--mantine-color-default)",
      }}
    >
      <Container size={520}>
        <Paper withBorder shadow="md" p={30} radius="md">
          <Stack gap="md">
            <div>
              <Title order={2} ta="center" mb="xs">
                Welcome to Ephemera
              </Title>
              <Text c="dimmed" size="sm" ta="center">
                Sign in to continue
              </Text>
            </div>

            {error && (
              <Alert
                icon={<IconAlertCircle size={16} />}
                title="Error"
                color="red"
                withCloseButton
                onClose={() => setError(null)}
              >
                {error}
              </Alert>
            )}

            <Tabs value={activeTab} onChange={setActiveTab}>
              <Tabs.List grow>
                {authMethods.password && (
                  <Tabs.Tab value="email" leftSection={<IconMail size={16} />}>
                    Email
                  </Tabs.Tab>
                )}
                {authMethods.booklore && (
                  <Tabs.Tab
                    value="booklore"
                    leftSection={<IconBook size={16} />}
                  >
                    Booklore
                  </Tabs.Tab>
                )}
                {authMethods.calibre && (
                  <Tabs.Tab
                    value="calibre"
                    leftSection={<IconDatabase size={16} />}
                  >
                    Calibre
                  </Tabs.Tab>
                )}
                {authMethods.oauth2 && oidcProviders.length > 0 && (
                  <Tabs.Tab
                    value="oidc"
                    leftSection={<IconPlugConnected size={16} />}
                  >
                    SSO
                  </Tabs.Tab>
                )}
              </Tabs.List>

              {authMethods.password && (
                <Tabs.Panel value="email" pt="md">
                  <form onSubmit={handleEmailSignIn}>
                    <Stack gap="md">
                      <TextInput
                        required
                        label="Email"
                        placeholder="your@email.com"
                        value={emailForm.email}
                        onChange={(e) =>
                          setEmailForm({ ...emailForm, email: e.target.value })
                        }
                        disabled={loading}
                        leftSection={<IconMail size={16} />}
                      />
                      <PasswordInput
                        required
                        label="Password"
                        placeholder="Your password"
                        value={emailForm.password}
                        onChange={(e) =>
                          setEmailForm({
                            ...emailForm,
                            password: e.target.value,
                          })
                        }
                        disabled={loading}
                        leftSection={<IconLock size={16} />}
                      />
                      <Button type="submit" fullWidth loading={loading}>
                        Sign In
                      </Button>
                    </Stack>
                  </form>
                </Tabs.Panel>
              )}

              {authMethods.booklore && (
                <Tabs.Panel value="booklore" pt="md">
                  <form onSubmit={handleBookloreSignIn}>
                    <Stack gap="md">
                      <TextInput
                        required
                        label="Username"
                        placeholder="Booklore username"
                        value={bookloreForm.username}
                        onChange={(e) =>
                          setBookloreForm({
                            ...bookloreForm,
                            username: e.target.value,
                          })
                        }
                        disabled={loading}
                        leftSection={<IconBook size={16} />}
                      />
                      <PasswordInput
                        required
                        label="Password"
                        placeholder="Booklore password"
                        value={bookloreForm.password}
                        onChange={(e) =>
                          setBookloreForm({
                            ...bookloreForm,
                            password: e.target.value,
                          })
                        }
                        disabled={loading}
                        leftSection={<IconLock size={16} />}
                      />
                      <Button type="submit" fullWidth loading={loading}>
                        Sign In with Booklore
                      </Button>
                    </Stack>
                  </form>
                </Tabs.Panel>
              )}

              {authMethods.calibre && (
                <Tabs.Panel value="calibre" pt="md">
                  <form onSubmit={handleCalibreSignIn}>
                    <Stack gap="md">
                      <TextInput
                        required
                        label="Username"
                        placeholder="Calibre-Web username"
                        value={calibreForm.username}
                        onChange={(e) =>
                          setCalibreForm({
                            ...calibreForm,
                            username: e.target.value,
                          })
                        }
                        disabled={loading}
                        leftSection={<IconDatabase size={16} />}
                      />
                      <PasswordInput
                        required
                        label="Password"
                        placeholder="Calibre-Web password"
                        value={calibreForm.password}
                        onChange={(e) =>
                          setCalibreForm({
                            ...calibreForm,
                            password: e.target.value,
                          })
                        }
                        disabled={loading}
                        leftSection={<IconLock size={16} />}
                      />
                      <Button type="submit" fullWidth loading={loading}>
                        Sign In with Calibre-Web
                      </Button>
                    </Stack>
                  </form>
                </Tabs.Panel>
              )}

              {authMethods.oauth2 && oidcProviders.length > 0 && (
                <Tabs.Panel value="oidc" pt="md">
                  <Stack gap="md">
                    <Text size="sm" c="dimmed" ta="center">
                      Sign in with your organization's identity provider
                    </Text>
                    {oidcProviders.map((provider) => (
                      <Button
                        key={provider.id}
                        fullWidth
                        leftSection={<IconPlugConnected size={20} />}
                        variant="default"
                        onClick={() => handleOIDCSignIn(provider.providerId)}
                        loading={loading}
                      >
                        Continue with {provider.name || provider.providerId}
                      </Button>
                    ))}
                  </Stack>
                </Tabs.Panel>
              )}
            </Tabs>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}

export const Route = createFileRoute("/login")({
  component: LoginPage,
});
