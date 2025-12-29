import {
  Modal,
  Stack,
  Text,
  Select,
  TextInput,
  Button,
  Group,
  Alert,
  Loader,
  Badge,
} from "@mantine/core";
import {
  IconCloudUpload,
  IconInfoCircle,
  IconBooks,
} from "@tabler/icons-react";
import { useState, useEffect } from "react";
import { useTolinoCollections } from "../hooks/useTolino";

interface TolinoUploadDialogProps {
  opened: boolean;
  onClose: () => void;
  onUpload: (collection?: string) => void;
  isUploading: boolean;
  bookTitle: string;
  needsConversion?: boolean;
  suggestedCollection?: string | null;
}

export function TolinoUploadDialog({
  opened,
  onClose,
  onUpload,
  isUploading,
  bookTitle,
  needsConversion,
  suggestedCollection,
}: TolinoUploadDialogProps) {
  const { data: collectionsData, isLoading: loadingCollections } =
    useTolinoCollections(opened);

  const [selectedCollection, setSelectedCollection] = useState<string | null>(
    null,
  );
  const [newCollectionName, setNewCollectionName] = useState("");
  const [showNewInput, setShowNewInput] = useState(false);

  const collections = collectionsData?.collections || [];

  // Initialize with suggested collection when dialog opens and collections load
  useEffect(() => {
    if (opened && !loadingCollections && suggestedCollection) {
      // Check if suggested collection exists in the list
      if (collections.includes(suggestedCollection)) {
        setSelectedCollection(suggestedCollection);
        setShowNewInput(false);
        setNewCollectionName("");
      } else {
        // Collection doesn't exist yet, prefill for creation
        setShowNewInput(true);
        setSelectedCollection(null);
        setNewCollectionName(suggestedCollection);
      }
    }
  }, [opened, loadingCollections, suggestedCollection, collections]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!opened) {
      setSelectedCollection(null);
      setNewCollectionName("");
      setShowNewInput(false);
    }
  }, [opened]);

  const handleCollectionChange = (value: string | null) => {
    if (value === "__new__") {
      setShowNewInput(true);
      setSelectedCollection(null);
    } else {
      setShowNewInput(false);
      setSelectedCollection(value);
    }
  };

  const handleUpload = () => {
    const collectionToUse = showNewInput
      ? newCollectionName.trim() || undefined
      : selectedCollection || undefined;
    onUpload(collectionToUse);
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Upload to Tolino Cloud"
      centered
    >
      <Stack gap="md">
        <Text size="sm">
          Upload <strong>{bookTitle}</strong> to your Tolino Cloud library.
        </Text>

        {needsConversion && (
          <Alert
            icon={<IconInfoCircle size={16} />}
            color="blue"
            variant="light"
          >
            <Text size="sm">
              This file will be converted to EPUB format before uploading.
            </Text>
          </Alert>
        )}

        <Select
          label={
            <Group gap="xs">
              <span>Add to collection (optional)</span>
              {suggestedCollection && (
                <Badge
                  size="xs"
                  variant="light"
                  color="grape"
                  leftSection={<IconBooks size={10} />}
                >
                  Series detected
                </Badge>
              )}
            </Group>
          }
          description={
            suggestedCollection
              ? `Suggested from series: "${suggestedCollection}"`
              : "Select an existing collection or create a new one"
          }
          placeholder={loadingCollections ? "Loading collections..." : "None"}
          data={[
            { value: "", label: "None (no collection)" },
            ...collections.map((c) => ({
              value: c,
              label: c,
            })),
            { value: "__new__", label: "+ Create new collection..." },
          ]}
          value={showNewInput ? "__new__" : selectedCollection || ""}
          onChange={handleCollectionChange}
          disabled={loadingCollections || isUploading}
          searchable
          rightSection={loadingCollections ? <Loader size="xs" /> : undefined}
        />

        {showNewInput && (
          <TextInput
            label="New collection name"
            placeholder="Enter collection name"
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
            disabled={isUploading}
          />
        )}

        <Group justify="flex-end" gap="sm" mt="md">
          <Button variant="default" onClick={onClose} disabled={isUploading}>
            Cancel
          </Button>
          <Button
            color="cyan"
            leftSection={<IconCloudUpload size={16} />}
            onClick={handleUpload}
            loading={isUploading}
            disabled={showNewInput && !newCollectionName.trim()}
          >
            Upload
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export default TolinoUploadDialog;
