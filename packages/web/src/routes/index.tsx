import { createFileRoute, Navigate } from "@tanstack/react-router";

function IndexPage() {
  return <Navigate to="/search" />;
}

export const Route = createFileRoute("/")({
  component: IndexPage,
});
