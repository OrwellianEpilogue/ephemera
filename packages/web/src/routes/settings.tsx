import { createFileRoute } from '@tanstack/react-router';
import { Container, Title, Text, Paper, Stack, Radio, Group, Button, Loader, Center, Alert, TextInput, NumberInput, Switch, PasswordInput, Select } from '@mantine/core';
import { IconInfoCircle, IconPlugConnected } from '@tabler/icons-react';
import { useAppSettings, useUpdateAppSettings, useBookloreSettings, useUpdateBookloreSettings, useTestBookloreConnection } from '../hooks/useSettings';
import { useState, useEffect } from 'react';
import type { PostDownloadAction, TimeFormat, DateFormat, RequestCheckInterval, LibraryLinkLocation } from '@ephemera/shared';
import { formatDate } from '@ephemera/shared';

function SettingsComponent() {
  const { data: settings, isLoading: loadingApp, isError: errorApp } = useAppSettings();
  const { data: bookloreSettings, isLoading: loadingBooklore, isError: errorBooklore } = useBookloreSettings();
  const updateSettings = useUpdateAppSettings();
  const updateBooklore = useUpdateBookloreSettings();
  const testConnection = useTestBookloreConnection();

  // App settings state
  const [postDownloadAction, setPostDownloadAction] = useState<PostDownloadAction>('both');
  const [bookRetentionDays, setBookRetentionDays] = useState<number>(30);
  const [requestCheckInterval, setRequestCheckInterval] = useState<RequestCheckInterval>('6h');
  const [timeFormat, setTimeFormat] = useState<TimeFormat>('24h');
  const [dateFormat, setDateFormat] = useState<DateFormat>('eur');
  const [libraryUrl, setLibraryUrl] = useState<string>('');
  const [libraryLinkLocation, setLibraryLinkLocation] = useState<LibraryLinkLocation>('sidebar');

  // Booklore settings state
  const [bookloreEnabled, setBookloreEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [username, setUsername] = useState(''); // For authentication only
  const [password, setPassword] = useState(''); // For authentication only
  const [libraryId, setLibraryId] = useState<number | ''>('');
  const [pathId, setPathId] = useState<number | ''>('');
  const [showAuthForm, setShowAuthForm] = useState(false); // Toggle auth form

  // Sync with fetched settings
  useEffect(() => {
    if (settings) {
      // If Booklore is not connected and user has upload-related action selected,
      // reset to move_only
      if (!bookloreSettings?.connected && (settings.postDownloadAction === 'upload_only' || settings.postDownloadAction === 'both')) {
        setPostDownloadAction('move_only');
      } else {
        setPostDownloadAction(settings.postDownloadAction);
      }
      setBookRetentionDays(settings.bookRetentionDays);
      setRequestCheckInterval(settings.requestCheckInterval);
      setTimeFormat(settings.timeFormat);
      setDateFormat(settings.dateFormat);
      setLibraryUrl(settings.libraryUrl || '');
      setLibraryLinkLocation(settings.libraryLinkLocation);
    }
  }, [settings, bookloreSettings?.connected]);

  useEffect(() => {
    if (bookloreSettings) {
      setBookloreEnabled(bookloreSettings.enabled);
      setBaseUrl(bookloreSettings.baseUrl || '');
      setLibraryId(bookloreSettings.libraryId || '');
      setPathId(bookloreSettings.pathId || '');
      // Show auth form only if not connected
      setShowAuthForm(!bookloreSettings.connected);
      // Clear credentials after successful auth
      setUsername('');
      setPassword('');
    }
  }, [bookloreSettings]);

  const handleSaveApp = () => {
    updateSettings.mutate({
      postDownloadAction,
      bookRetentionDays,
      requestCheckInterval,
      timeFormat,
      dateFormat,
      libraryUrl: libraryUrl || null,
      libraryLinkLocation
    });
  };

  const handleSaveBooklore = () => {
    updateBooklore.mutate({
      enabled: bookloreEnabled,
      baseUrl: baseUrl || undefined,
      username: username || undefined,
      password: password || undefined,
      libraryId: libraryId || undefined,
      pathId: pathId || undefined,
      autoUpload: true, // Always true - uploads happen when post-download action is set to 'both'
    });
  };

  const handleTestConnection = () => {
    testConnection.mutate();
  };

  const hasAppChanges = settings && (
    settings.postDownloadAction !== postDownloadAction ||
    settings.bookRetentionDays !== bookRetentionDays ||
    settings.requestCheckInterval !== requestCheckInterval ||
    settings.timeFormat !== timeFormat ||
    settings.dateFormat !== dateFormat ||
    (settings.libraryUrl || '') !== libraryUrl ||
    settings.libraryLinkLocation !== libraryLinkLocation
  );
  // Check if there are unsaved changes OR if this is authentication/re-authentication
  const hasBookloreChanges = bookloreSettings ? (
    bookloreSettings.enabled !== bookloreEnabled ||
    bookloreSettings.baseUrl !== baseUrl ||
    bookloreSettings.libraryId !== libraryId ||
    bookloreSettings.pathId !== pathId ||
    // Enable save if user has entered credentials (for auth/re-auth)
    (showAuthForm && username !== '' && password !== '')
  ) : (
    // New setup: enable save button if user has entered all required values
    bookloreEnabled && baseUrl !== '' && username !== '' && password !== '' && libraryId !== '' && pathId !== ''
  );

  const isLoading = loadingApp || loadingBooklore;
  const isError = errorApp || errorBooklore;

  if (isLoading) {
    return (
      <Container size="md">
        <Center p="xl">
          <Loader size="lg" />
        </Center>
      </Container>
    );
  }

  if (isError) {
    return (
      <Container size="md">
        <Alert icon={<IconInfoCircle size={16} />} title="Error" color="red">
          Failed to load settings. Please try again.
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="md">
      <Stack gap="lg">
        <Title order={1}>Settings</Title>

        {/* Post-Download Actions */}
        <Paper p="md" withBorder>
          <Stack gap="md">
            <Title order={3}>Post-Download Actions</Title>
            <Text size="sm" c="dimmed">
              Configure what happens after a book is successfully downloaded
            </Text>

            <Radio.Group
              value={postDownloadAction}
              onChange={(value) => setPostDownloadAction(value as PostDownloadAction)}
            >
              <Stack gap="sm">
                <Radio
                  value="move_only"
                  label="Move Only"
                  description="Move downloaded files to your configured ingest folder"
                />
                <Radio
                  value="upload_only"
                  label="Upload Only"
                  description="Upload to Booklore and delete the local file (requires Booklore configuration)"
                  disabled={!bookloreSettings?.enabled || !bookloreSettings?.connected}
                />
                <Radio
                  value="both"
                  label="Move and Upload"
                  description="Move to ingest folder AND upload to Booklore (requires Booklore configuration)"
                  disabled={!bookloreSettings?.enabled || !bookloreSettings?.connected}
                />
              </Stack>
            </Radio.Group>

            {(!bookloreSettings?.enabled || !bookloreSettings?.connected) && (
              <Alert icon={<IconInfoCircle size={16} />} color="blue">
                <Text size="sm">
                  <strong>Note:</strong> {!bookloreSettings?.enabled
                    ? 'Enable and configure Booklore below to use upload options.'
                    : 'Authenticate with Booklore below to enable upload options.'}
                </Text>
              </Alert>
            )}
          </Stack>
        </Paper>

        {/* Requests */}
        <Paper p="md" withBorder>
          <Stack gap="md">
            <Title order={3}>Requests</Title>
            <Text size="sm" c="dimmed">
              Configure how saved book requests are checked
            </Text>

            <Select
              label="Request Check Interval"
              description="How often to automatically check saved book requests for new results"
              placeholder="Select interval"
              value={requestCheckInterval}
              onChange={(value) => setRequestCheckInterval(value as RequestCheckInterval)}
              data={[
                { value: '1min', label: 'Every minute (Not recommended)' },
                { value: '15min', label: 'Every 15 minutes' },
                { value: '30min', label: 'Every 30 minutes' },
                { value: '1h', label: 'Every hour' },
                { value: '6h', label: 'Every 6 hours' },
                { value: '12h', label: 'Every 12 hours' },
                { value: '24h', label: 'Every 24 hours' },
                { value: 'weekly', label: 'Weekly' },
              ]}
              required
            />

            {requestCheckInterval === '1min' && (
              <Alert icon={<IconInfoCircle size={16} />} color="red">
                <Text size="sm">
                  <strong>Warning:</strong> Checking every minute may result in excessive requests and could get you banned from the service. Use at your own risk.
                </Text>
              </Alert>
            )}
          </Stack>
        </Paper>

        {/* Display Preferences */}
        <Paper p="md" withBorder>
          <Stack gap="md">
            <Title order={3}>Display Preferences</Title>
            <Text size="sm" c="dimmed">
              Customize how dates and times are displayed throughout the application
            </Text>

            <Radio.Group
              label="Time Format"
              description="Choose how times are displayed"
              value={timeFormat}
              onChange={(value) => setTimeFormat(value as TimeFormat)}
            >
              <Stack gap="sm" mt="xs">
                <Radio
                  value="24h"
                  label="24 Hours"
                  description="Display times in 24 hours format (e.g., 14:30)"
                />
                <Radio
                  value="ampm"
                  label="12 Hours (AM/PM)"
                  description="Display times in 12 hours format with AM/PM (e.g., 2:30 PM)"
                />
              </Stack>
            </Radio.Group>

            <Radio.Group
              label="Date Format"
              description="Choose how dates are displayed"
              value={dateFormat}
              onChange={(value) => setDateFormat(value as DateFormat)}
            >
              <Stack gap="sm" mt="xs">
                <Radio
                  value="eur"
                  label="EUR Format"
                  description="DD.MM.YYYY (e.g., 31.12.2023)"
                />
                <Radio
                  value="us"
                  label="US Format"
                  description="MM/DD/YYYY (e.g., 12/31/2023)"
                />
              </Stack>
            </Radio.Group>
          </Stack>
        </Paper>

        {/* Library Link */}
        <Paper p="md" withBorder>
          <Stack gap="md">
            <Title order={3}>Library Link</Title>
            <Text size="sm" c="dimmed">
              Add a link to your external library (e.g., BookLore, Calibre-Web-Automated or other book management system)
            </Text>

            <TextInput
              label="Library URL"
              placeholder="https://booklore.example.com"
              value={libraryUrl}
              onChange={(e) => setLibraryUrl(e.target.value)}
              description="Enter the full URL to your library"
            />

            <Radio.Group
              label="Link Location"
              description="Choose where to display the library link"
              value={libraryLinkLocation}
              onChange={(value) => setLibraryLinkLocation(value as LibraryLinkLocation)}
            >
              <Stack gap="sm" mt="xs">
                <Radio
                  value="sidebar"
                  label="Sidebar"
                  description="Display the link in the sidebar navigation"
                />
                <Radio
                  value="header"
                  label="Header"
                  description="Display the link in the header next to the theme toggle"
                />
                <Radio
                  value="both"
                  label="Sidebar & Header"
                  description="Display the link in both the sidebar and header"
                />
              </Stack>
            </Radio.Group>
          </Stack>
        </Paper>

        {/* Cache */}
        <Paper p="md" withBorder>
          <Stack gap="md">
            <Title order={3}>Cache</Title>
            <Text size="sm" c="dimmed">
              Configure cache retention settings
            </Text>

            <NumberInput
              label="Book Cache Retention Period"
              description="Number of days to keep book search and download cache before auto-deleting them (0 = never delete, cleanup runs daily)"
              placeholder="30"
              value={bookRetentionDays}
              onChange={(value) => setBookRetentionDays(Number(value) || 0)}
              min={0}
              max={365}
              required
            />
          </Stack>
        </Paper>

        {/* Save App Settings Button */}
        <Group justify="flex-end">
          <Button
            onClick={handleSaveApp}
            disabled={!hasAppChanges}
            loading={updateSettings.isPending}
          >
            Save App Settings
          </Button>
        </Group>

        {/* Booklore Settings */}
        <Paper p="md" withBorder>
          <Stack gap="md">
            <Group justify="space-between">
              <div>
                <Title order={3}>Booklore Integration</Title>
                <Text size="sm" c="dimmed">
                  Configure automatic upload to your Booklore library
                </Text>
              </div>
              <Switch
                checked={bookloreEnabled}
                onChange={(e) => setBookloreEnabled(e.currentTarget.checked)}
                label="Enabled"
                size="lg"
              />
            </Group>


            {/* Show save button if user toggled Booklore off (form is hidden but change needs saving) */}
            {!bookloreEnabled && bookloreSettings && bookloreSettings.enabled && (
              <Group justify="flex-end">
                <Button
                  onClick={handleSaveBooklore}
                  loading={updateBooklore.isPending}
                >
                  Disable Booklore
                </Button>
              </Group>
            )}

            {bookloreEnabled && (
              <Stack gap="sm">
                <TextInput
                  label="Base URL"
                  placeholder="http://192.168.7.3:6060"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  required
                />

                <NumberInput
                  label="Library ID"
                  placeholder="e.g., 1"
                  value={libraryId}
                  onChange={(value) => setLibraryId(value as number | '')}
                  min={1}
                  required
                />

                <NumberInput
                  label="Path ID"
                  placeholder="e.g., 1"
                  value={pathId}
                  onChange={(value) => setPathId(value as number | '')}
                  min={1}
                  required
                />

                {/* Show connection status if connected */}
                {bookloreSettings?.connected && !showAuthForm && (
                  <Alert icon={<IconPlugConnected size={16} />} color="green" mt="sm">
                    <Stack gap="xs">
                      <Text size="sm" fw={500}>
                        ✓ Connected to Booklore
                      </Text>
                      {bookloreSettings.accessTokenExpiresAt && (
                        <Text size="xs" c="dimmed">
                          Access token expires: {formatDate(bookloreSettings.accessTokenExpiresAt, dateFormat, timeFormat)}
                        </Text>
                      )}
                      {bookloreSettings.refreshTokenExpiresAt && (
                        <Text size="xs" c="dimmed">
                          Refresh token expires: {formatDate(bookloreSettings.refreshTokenExpiresAt, dateFormat, timeFormat)}
                        </Text>
                      )}
                      <Button
                        size="xs"
                        variant="light"
                        onClick={() => setShowAuthForm(true)}
                        mt="xs"
                      >
                        Re-authenticate
                      </Button>
                    </Stack>
                  </Alert>
                )}

                {/* Show authentication form when needed */}
                {(showAuthForm || !bookloreSettings?.connected) && (
                  <Stack gap="sm">
                    <TextInput
                      label="Username"
                      placeholder="Enter your Booklore username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      description="Credentials are used for authentication only, never stored"
                      required
                    />

                    <PasswordInput
                      label="Password"
                      placeholder="Enter your Booklore password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </Stack>
                )}

                <Alert icon={<IconInfoCircle size={16} />} color="blue" mt="sm">
                  <Text size="sm">
                    <strong>Note:</strong> When post-download action is set to "Upload only" or "Move and Upload", files will always be uploaded to Booklore automatically if it's enabled and configured.
                  </Text>
                </Alert>

                <Group justify="space-between">
                  <Button
                    variant="outline"
                    leftSection={<IconPlugConnected size={16} />}
                    onClick={handleTestConnection}
                    loading={testConnection.isPending}
                    disabled={!bookloreSettings?.connected}
                  >
                    Test Connection
                  </Button>
                  <Button
                    onClick={handleSaveBooklore}
                    disabled={!hasBookloreChanges}
                    loading={updateBooklore.isPending}
                  >
                    {bookloreSettings?.connected ? 'Save Changes' : 'Save & Authenticate'}
                  </Button>
                </Group>
              </Stack>
            )}

            {!bookloreEnabled && (
              <>
                <Alert icon={<IconInfoCircle size={16} />} color="gray">
                  <Text size="sm">
                    Booklore integration is currently disabled. Enable it above to configure automatic uploads.
                  </Text>
                </Alert>

                {/* Show clear auth button if tokens still exist while disabled */}
                {bookloreSettings?.connected && (
                  <Alert icon={<IconInfoCircle size={16} />} color="yellow">
                    <Stack gap="xs">
                      <Text size="sm">
                        Authentication data is still stored. Clear it for better security.
                      </Text>
                      <Button
                        size="xs"
                        variant="light"
                        color="red"
                        onClick={async () => {
                          await updateBooklore.mutateAsync({ enabled: false });
                        }}
                        loading={updateBooklore.isPending}
                      >
                        Clear Authentication Data
                      </Button>
                    </Stack>
                  </Alert>
                )}
              </>
            )}
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}

export const Route = createFileRoute('/settings')({
  component: SettingsComponent,
});
