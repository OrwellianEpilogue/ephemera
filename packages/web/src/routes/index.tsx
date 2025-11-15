import { createFileRoute, Navigate } from "@tanstack/react-router";
import { requireAuth } from "../lib/route-auth";

function IndexPage() {
  return <Navigate to="/search" />;
}

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    await requireAuth();
  },
  component: IndexPage,
});
