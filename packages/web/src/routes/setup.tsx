import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Box,
  Button,
  Container,
  Loader,
  Paper,
  PasswordInput,
  Stack,
  Stepper,
  Text,
  TextInput,
  Title,
  Alert,
  Group,
  Center,
} from "@mantine/core";
import {
  IconCheck,
  IconAlertCircle,
  IconSettings,
  IconUser,
} from "@tabler/icons-react";

function SetupWizard() {
  const navigate = useNavigate();

  // Stepper state
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: System Configuration
  const [step1, setStep1] = useState({
    searcherBaseUrl: "",
    searcherApiKey: "",
    quickBaseUrl: "",
    downloadFolder: "/app/downloads",
    ingestFolder: "/app/ingest",
  });
  const [loadingDefaults, setLoadingDefaults] = useState(true);

  // Fetch environment defaults on mount
  useEffect(() => {
    const fetchDefaults = async () => {
      try {
        const response = await fetch("/api/setup/defaults");
        if (response.ok) {
          const defaults = await response.json();
          setStep1((prev) => ({
            searcherBaseUrl: defaults.searcherBaseUrl || prev.searcherBaseUrl,
            searcherApiKey: defaults.searcherApiKey || prev.searcherApiKey,
            quickBaseUrl: defaults.quickBaseUrl || prev.quickBaseUrl,
            downloadFolder: defaults.downloadFolder || prev.downloadFolder,
            ingestFolder: defaults.ingestFolder || prev.ingestFolder,
          }));
        }
      } catch (err) {
        console.error("Failed to fetch defaults:", err);
      } finally {
        setLoadingDefaults(false);
      }
    };
    fetchDefaults();
  }, []);

  // Step 2: Admin Account
  const [adminForm, setAdminForm] = useState({
    username: "admin",
    email: "admin@localhost",
    password: "",
    confirmPassword: "",
  });

  // Validation
  const validateStep1 = () => {
    if (!step1.searcherBaseUrl) {
      setError("Searcher Base URL is required");
      return false;
    }
    if (!step1.downloadFolder) {
      setError("Download folder is required");
      return false;
    }
    if (!step1.ingestFolder) {
      setError("Ingest folder is required");
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (!adminForm.username) {
      setError("Username is required");
      return false;
    }
    if (!adminForm.password) {
      setError("Password is required");
      return false;
    }
    if (adminForm.password.length < 8) {
      setError("Password must be at least 8 characters");
      return false;
    }
    if (adminForm.password !== adminForm.confirmPassword) {
      setError("Passwords do not match");
      return false;
    }
    return true;
  };

  // Step handlers
  const handleNext = async () => {
    setError(null);
    setLoading(true);

    try {
      if (active === 0) {
        // Validate and save step 1
        if (!validateStep1()) {
          setLoading(false);
          return;
        }

        const response = await fetch("/api/setup/step1", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(step1),
        });

        if (!response.ok) {
          throw new Error("Failed to save configuration");
        }

        setActive(1);
      } else if (active === 1) {
        // Validate and create admin user
        if (!validateStep2()) {
          setLoading(false);
          return;
        }

        // Create admin user via backend API
        const response = await fetch("/api/setup/step2", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: adminForm.username,
            email: adminForm.email,
            password: adminForm.password,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to create admin user");
        }

        setActive(2);
      } else if (active === 2) {
        // Complete setup
        const response = await fetch("/api/setup/complete", {
          method: "POST",
        });

        if (!response.ok) {
          throw new Error("Failed to complete setup");
        }

        // Redirect to login
        navigate({ to: "/login" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setError(null);
    setActive((current) => (current > 0 ? current - 1 : current));
  };

  if (loadingDefaults) {
    return (
      <Box
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--mantine-color-gray-0)",
        }}
      >
        <Center>
          <Stack align="center" gap="md">
            <Loader size="lg" />
            <Text c="dimmed">Loading configuration...</Text>
          </Stack>
        </Center>
      </Box>
    );
  }

  return (
    <Box
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--mantine-color-gray-0)",
      }}
    >
      <Container size="md" py="xl">
        <Paper shadow="md" p="xl" radius="md">
          <Stack gap="lg">
            <div>
              <Title order={2}>Welcome to Ephemera</Title>
              <Text c="dimmed" size="sm">
                Let's set up your book downloader
              </Text>
            </div>

            {error && (
              <Alert
                icon={<IconAlertCircle size={16} />}
                title="Error"
                color="red"
              >
                {error}
              </Alert>
            )}

            <Stepper
              active={active}
              onStepClick={setActive}
              allowNextStepsSelect={false}
            >
              {/* Step 1: System Configuration */}
              <Stepper.Step
                label="Configuration"
                description="System settings"
                icon={<IconSettings size={18} />}
              >
                <Stack gap="md" mt="md">
                  <TextInput
                    label="Searcher Base URL"
                    placeholder="https://archive.org"
                    description="Base URL for AA or similar"
                    required
                    value={step1.searcherBaseUrl}
                    onChange={(e) =>
                      setStep1({ ...step1, searcherBaseUrl: e.target.value })
                    }
                  />

                  <PasswordInput
                    label="Searcher API Key"
                    placeholder="Optional - for faster downloads"
                    description="API key for authenticated downloads"
                    value={step1.searcherApiKey}
                    onChange={(e) =>
                      setStep1({ ...step1, searcherApiKey: e.target.value })
                    }
                  />

                  <TextInput
                    label="Quick Base URL"
                    placeholder="LG URL for alternative source"
                    description="Alternative fast download source (optional)"
                    value={step1.quickBaseUrl}
                    onChange={(e) =>
                      setStep1({ ...step1, quickBaseUrl: e.target.value })
                    }
                  />

                  <TextInput
                    label="Download Folder"
                    placeholder="/app/downloads"
                    description="Temporary download location"
                    required
                    value={step1.downloadFolder}
                    onChange={(e) =>
                      setStep1({ ...step1, downloadFolder: e.target.value })
                    }
                  />

                  <TextInput
                    label="Ingest Folder"
                    placeholder="/app/ingest"
                    description="Final location for completed downloads"
                    required
                    value={step1.ingestFolder}
                    onChange={(e) =>
                      setStep1({ ...step1, ingestFolder: e.target.value })
                    }
                  />
                </Stack>
              </Stepper.Step>

              {/* Step 2: Admin Account */}
              <Stepper.Step
                label="Admin Account"
                description="Create first user"
                icon={<IconUser size={18} />}
              >
                <Stack gap="md" mt="md">
                  <Alert color="blue">
                    Create the first admin account. This user will have full
                    access to all settings and features.
                  </Alert>

                  <TextInput
                    label="Username"
                    placeholder="admin"
                    required
                    value={adminForm.username}
                    onChange={(e) =>
                      setAdminForm({ ...adminForm, username: e.target.value })
                    }
                  />

                  <TextInput
                    label="Email"
                    placeholder="admin@localhost"
                    type="email"
                    value={adminForm.email}
                    onChange={(e) =>
                      setAdminForm({ ...adminForm, email: e.target.value })
                    }
                  />

                  <PasswordInput
                    label="Password"
                    placeholder="Choose a strong password"
                    required
                    description="Minimum 8 characters"
                    value={adminForm.password}
                    onChange={(e) =>
                      setAdminForm({ ...adminForm, password: e.target.value })
                    }
                  />

                  <PasswordInput
                    label="Confirm Password"
                    placeholder="Re-enter password"
                    required
                    value={adminForm.confirmPassword}
                    onChange={(e) =>
                      setAdminForm({
                        ...adminForm,
                        confirmPassword: e.target.value,
                      })
                    }
                  />
                </Stack>
              </Stepper.Step>

              {/* Step 3: Complete */}
              <Stepper.Completed>
                <Stack gap="md" mt="md" align="center">
                  <IconCheck size={48} color="green" />
                  <Title order={3}>Setup Complete!</Title>
                  <Text ta="center" c="dimmed">
                    Your Ephemera instance is now configured and ready to use.
                    <br />
                    Click finish to proceed to the login page.
                  </Text>
                </Stack>
              </Stepper.Completed>
            </Stepper>

            <Group justify="space-between" mt="xl">
              {active > 0 && active < 2 && (
                <Button
                  variant="default"
                  onClick={handleBack}
                  disabled={loading}
                >
                  Back
                </Button>
              )}
              {active < 2 ? (
                <Button onClick={handleNext} loading={loading} ml="auto">
                  {active === 1 ? "Create Admin & Continue" : "Next"}
                </Button>
              ) : (
                <Button onClick={handleNext} loading={loading} ml="auto">
                  Finish
                </Button>
              )}
            </Group>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}

export const Route = createFileRoute("/setup")({
  component: SetupWizard,
});
