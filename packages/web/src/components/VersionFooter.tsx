import { Group, Text, Badge, Anchor, Box } from "@mantine/core";
import { useVersion } from "../hooks/useVersion";
import { useTranslation } from "react-i18next";

export function VersionFooter() {
  const { data: versionInfo, isLoading, error } = useVersion();
  const { t } = useTranslation("translation", {
    keyPrefix: "layout",
  });
  // Don't show anything if there's an error
  if (error) {
    return null;
  }

  // Show loading state with placeholder
  if (isLoading || !versionInfo) {
    return (
      <Box pt="md" style={{ marginLeft: 15 }}>
        <Group justify="space-between" gap="xs">
          <Text size="xs" c="dimmed">
            {t("footer.loading")}
          </Text>
        </Group>
      </Box>
    );
  }

  return (
    <Box pt="md" style={{ marginLeft: 15 }}>
      <Group justify="space-between" gap="xs">
        <Text size="xs" c="dimmed">
          {t("app_title")} v{versionInfo.currentVersion}
        </Text>
        {versionInfo.updateAvailable && versionInfo.releaseUrl && (
          <Anchor
            href={versionInfo.releaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: "none" }}
          >
            <Badge
              size="sm"
              variant="filled"
              color="green"
              style={{ cursor: "pointer" }}
            >
              {t("footer.update_available")}
            </Badge>
          </Anchor>
        )}
      </Group>
    </Box>
  );
}
