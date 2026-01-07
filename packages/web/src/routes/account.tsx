import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "../lib/route-auth";
import { usePageTitle } from "../hooks/use-page-title";
import { Container, Title, Stack, Loader, Center } from "@mantine/core";
import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";

const AccountSettings = lazy(() => import("../components/AccountSettings"));

function AccountPage() {
  const { t } = useTranslation("translation", {
    keyPrefix: "account",
  });
  usePageTitle(t("title"));

  return (
    <Container size="md">
      <Stack gap="lg">
        <Title order={1}>{t("title")}</Title>
        <Suspense
          fallback={
            <Center p="xl">
              <Loader size="lg" />
            </Center>
          }
        >
          <AccountSettings />
        </Suspense>
      </Stack>
    </Container>
  );
}

export const Route = createFileRoute("/account")({
  beforeLoad: async () => {
    await requireAuth();
  },
  component: AccountPage,
});
