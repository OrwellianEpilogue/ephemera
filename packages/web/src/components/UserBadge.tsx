import { Badge } from "@mantine/core";

interface UserBadgeProps {
  userId: string;
  userName?: string;
  size?: "xs" | "sm" | "md";
}

/**
 * UserBadge component displays user information
 * Only visible to admins
 */
export function UserBadge({ userName, size = "sm" }: UserBadgeProps) {
  return (
    <Badge size={size} variant="light" color="violet">
      {userName || "Unknown User"}
    </Badge>
  );
}
