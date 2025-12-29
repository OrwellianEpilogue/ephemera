import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "../lib/route-auth";
import { usePageTitle } from "../hooks/use-page-title";
import { Container, Title, Stack, Loader, Center } from "@mantine/core";
import { lazy, Suspense } from "react";

const AccountSettings = lazy(() => import("../components/AccountSettings"));

function AccountPage() {
  usePageTitle("Account");

  return (
    <Container size="md">
      <Stack gap="lg">
        <Title order={1}>Account</Title>
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
