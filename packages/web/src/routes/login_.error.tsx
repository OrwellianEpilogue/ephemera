import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

// This route handles SSO error redirects from Better Auth
// Better Auth redirects to {errorCallbackURL}/error?error=...
function LoginErrorPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get("error");

    // Store error in sessionStorage and redirect to login
    if (errorParam) {
      sessionStorage.setItem("sso_error", decodeURIComponent(errorParam));
    }

    navigate({ to: "/login", replace: true });
  }, [navigate]);

  return null;
}

export const Route = createFileRoute("/login_/error")({
  component: LoginErrorPage,
});
