import { Badge, Group, Tooltip, Text } from "@mantine/core";
import { IconUser } from "@tabler/icons-react";

interface UserBadgeProps {
  userId: string;
  userName?: string;
  userEmail?: string;
  size?: "xs" | "sm" | "md";
}

/**
 * UserBadge component displays user information with avatar and name
 * Shows tooltip with email on hover
 * Only visible to admins
 */
export function UserBadge({
  userName,
  userEmail,
  size = "sm",
}: UserBadgeProps) {
  // Determine display name
  const displayName = userName || userEmail?.split("@")[0] || "Unknown User";

  // Get initials for avatar
  const getInitials = () => {
    if (userName) {
      // Get first letter of first name and last name
      const parts = userName.split(" ");
      if (parts.length >= 2) {
        return (parts[0]?.[0] || "") + (parts[parts.length - 1]?.[0] || "");
      }
      return userName[0] || "?";
    }
    if (userEmail) {
      return userEmail[0] || "?";
    }
    return "?";
  };

  const initials = getInitials().toUpperCase();

  const content = (
    <Badge size={size} variant="light" color="violet">
      {initials} {displayName}
    </Badge>
  );

  // Show tooltip with email if available
  if (userEmail) {
    return (
      <Tooltip
        label={
          <Group gap={4}>
            <IconUser size={14} />
            <Text size="xs">{userEmail}</Text>
          </Group>
        }
        withArrow
      >
        {content}
      </Tooltip>
    );
  }

  return content;
}
