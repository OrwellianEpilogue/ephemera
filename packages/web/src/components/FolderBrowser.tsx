import { useState, useEffect } from "react";
import {
  Modal,
  TextInput,
  Button,
  Group,
  Stack,
  ScrollArea,
  Table,
  ActionIcon,
  Text,
  Loader,
  Alert,
  Breadcrumbs,
  Anchor,
  Box,
} from "@mantine/core";
import {
  IconFolder,
  IconFile,
  IconChevronUp,
  IconHome,
  IconAlertCircle,
} from "@tabler/icons-react";
import { useDirectoryListing } from "../hooks/use-filesystem";

interface FolderBrowserProps {
  opened: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  initialPath?: string;
  title?: string;
  selectButtonText?: string;
  showFiles?: boolean;
}

export function FolderBrowser({
  opened,
  onClose,
  onSelect,
  initialPath = "/",
  title = "Select Folder",
  selectButtonText = "Select",
  showFiles = false,
}: FolderBrowserProps) {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [manualPath, setManualPath] = useState(initialPath);
  const [pathRedirected, setPathRedirected] = useState(false);
  const { data, isLoading, error } = useDirectoryListing(currentPath);

  // Update manual path when current path changes
  useEffect(() => {
    setManualPath(currentPath);
  }, [currentPath]);

  // Check if path was redirected
  useEffect(() => {
    if (data && data.currentPath !== currentPath) {
      setCurrentPath(data.currentPath);
      setPathRedirected(true);
    }
  }, [data, currentPath]);

  // Reset to initial path when modal opens
  useEffect(() => {
    if (opened) {
      setCurrentPath(initialPath);
      setManualPath(initialPath);
      setPathRedirected(false);
    }
  }, [opened, initialPath]);

  const handleNavigate = (path: string) => {
    setCurrentPath(path);
  };

  const handleManualPathSubmit = () => {
    setCurrentPath(manualPath);
  };

  const handleSelect = () => {
    onSelect(currentPath);
    onClose();
  };

  // Generate breadcrumb items from path
  const getBreadcrumbs = () => {
    const parts = currentPath.split("/").filter(Boolean);
    const breadcrumbs = [{ title: "Root", path: "/" }];

    let accumulatedPath = "";
    for (const part of parts) {
      accumulatedPath += "/" + part;
      breadcrumbs.push({
        title: part,
        path: accumulatedPath,
      });
    }

    return breadcrumbs;
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      size="lg"
      padding="md"
    >
      <Stack gap="md">
        {/* Manual path input */}
        <Group>
          <TextInput
            flex={1}
            value={manualPath}
            onChange={(e) => setManualPath(e.currentTarget.value)}
            placeholder="/path/to/folder"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleManualPathSubmit();
              }
            }}
          />
          <Button
            variant="default"
            onClick={handleManualPathSubmit}
            disabled={isLoading}
          >
            Browse
          </Button>
        </Group>

        {/* Show redirect notice if path was changed */}
        {pathRedirected && (
          <Alert
            icon={<IconAlertCircle size="1rem" />}
            color="blue"
            variant="light"
            onClose={() => setPathRedirected(false)}
            withCloseButton
          >
            <Text size="sm">
              The requested path didn't exist. Showing nearest valid directory
              instead.
            </Text>
          </Alert>
        )}

        {/* Breadcrumb navigation */}
        <Breadcrumbs separator="/">
          {getBreadcrumbs().map((item, index, array) => (
            <Anchor
              key={item.path}
              onClick={() => handleNavigate(item.path)}
              size="sm"
              style={{ cursor: "pointer" }}
              fw={index === array.length - 1 ? 500 : 400}
            >
              {item.title}
            </Anchor>
          ))}
        </Breadcrumbs>

        {/* Directory contents */}
        <Box>
          <ScrollArea h={400} type="auto" offsetScrollbars>
            {error ? (
              <Alert
                icon={<IconAlertCircle size="1rem" />}
                color="red"
                variant="light"
              >
                Failed to load directory:{" "}
                {(error as Error)?.message || "Unknown error"}
              </Alert>
            ) : isLoading ? (
              <Group justify="center" py="xl">
                <Loader size="md" />
              </Group>
            ) : data ? (
              <Table highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ width: "40px" }}>Type</Table.Th>
                    <Table.Th>Name</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {/* Parent directory navigation */}
                  {data.parentPath && (
                    <Table.Tr
                      onClick={() => handleNavigate(data.parentPath!)}
                      style={{ cursor: "pointer" }}
                    >
                      <Table.Td>
                        <ActionIcon variant="subtle" size="sm">
                          <IconChevronUp size="1rem" />
                        </ActionIcon>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">..</Text>
                      </Table.Td>
                    </Table.Tr>
                  )}

                  {/* Directory entries */}
                  {data.entries
                    .filter((entry) => showFiles || entry.type === "directory")
                    .map((entry) => (
                      <Table.Tr
                        key={entry.path}
                        onClick={() => {
                          if (entry.type === "directory") {
                            handleNavigate(entry.path);
                          }
                        }}
                        style={{
                          cursor:
                            entry.type === "directory" ? "pointer" : "default",
                        }}
                      >
                        <Table.Td>
                          <ActionIcon
                            variant="subtle"
                            size="sm"
                            color={entry.type === "directory" ? "blue" : "gray"}
                          >
                            {entry.type === "directory" ? (
                              <IconFolder size="1rem" />
                            ) : (
                              <IconFile size="1rem" />
                            )}
                          </ActionIcon>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{entry.name}</Text>
                        </Table.Td>
                      </Table.Tr>
                    ))}

                  {/* Empty directory message */}
                  {data.entries.filter(
                    (entry) => showFiles || entry.type === "directory",
                  ).length === 0 && (
                    <Table.Tr>
                      <Table.Td colSpan={2}>
                        <Text size="sm" c="dimmed" ta="center" py="md">
                          No {showFiles ? "items" : "folders"} in this directory
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            ) : null}
          </ScrollArea>
        </Box>

        {/* Action buttons */}
        <Group justify="space-between">
          <Group>
            <ActionIcon
              variant="default"
              onClick={() => handleNavigate("/")}
              title="Go to root"
            >
              <IconHome size="1rem" />
            </ActionIcon>
            <Text size="sm" c="dimmed">
              Current: {currentPath}
            </Text>
          </Group>
          <Group>
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSelect} disabled={isLoading || !!error}>
              {selectButtonText}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
