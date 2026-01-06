import {
  Container,
  Stack,
  Text,
  Loader,
  ThemeIcon,
  List,
  Code,
} from "@mantine/core";
import { IconAlertTriangle, IconWorldOff } from "@tabler/icons-react";
import { useTranslation, Trans } from "react-i18next";

interface MaintenanceBannerProps {
  flareSolverrDown: boolean;
  searcherBlocked: boolean;
  reason: string | null;
}

/**
 * Full-page maintenance banner shown when services are unavailable.
 * Shows different messages for FlareSolverr vs searcher being blocked.
 */
export const MaintenanceBanner = ({
  flareSolverrDown,
  searcherBlocked,
  reason,
}: MaintenanceBannerProps) => {
  const { t } = useTranslation("translation", { keyPrefix: "maintenance" });

  // Determine which failure type to display
  const isSearcherIssue = searcherBlocked && !flareSolverrDown;

  const title = isSearcherIssue
    ? t("searcher_blocked.title")
    : t("service_unavailable.title");

  const Icon = isSearcherIssue ? IconWorldOff : IconAlertTriangle;

  const defaultMessage = flareSolverrDown
    ? t("service_unavailable.flaresolverr_down")
    : searcherBlocked
      ? t("searcher_blocked.message")
      : t("service_unavailable.generic_message");

  return (
    <Container size="sm" py="xl">
      <Stack align="center" gap="lg">
        <ThemeIcon size={80} radius="xl" color="yellow" variant="light">
          <Icon size={48} />
        </ThemeIcon>

        <Text size="xl" fw={600} ta="center">
          {title}
        </Text>

        <Text c="dimmed" ta="center" maw={400}>
          {reason || defaultMessage}
        </Text>

        {/* Show actionable suggestions for searcher blocked */}
        {isSearcherIssue && (
          <Stack gap="xs" maw={450}>
            <Text size="sm" fw={500} ta="center">
              {t("suggestions.title")}
            </Text>
            <List size="sm" c="dimmed" spacing="xs">
              <List.Item>
                <Trans
                  i18nKey="maintenance.suggestions.dns"
                  components={{ code: <Code /> }}
                />
              </List.Item>
              <List.Item>{t("suggestions.vpn")}</List.Item>
              <List.Item>{t("suggestions.admin")}</List.Item>
            </List>
          </Stack>
        )}

        <Stack align="center" gap="xs" mt="md">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            {t("checking_recovery")}
          </Text>
        </Stack>
      </Stack>
    </Container>
  );
};
