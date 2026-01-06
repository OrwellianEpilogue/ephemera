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
import { useTranslation, Trans } from "react-i18next";

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
  const { t } = useTranslation("translation", {
    keyPrefix: "settings.tolino.upload",
  });
  // Use non-prefixed t for common translations
  const { t: tCommon } = useTranslation("translation", {
    keyPrefix: "common",
  });

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
    <Modal opened={opened} onClose={onClose} title={t("title")} centered>
      <Stack gap="md">
        <Text size="sm">
          <Trans
            t={t}
            i18nKey="description"
            values={{ title: bookTitle }}
            components={{ strong: <strong /> }}
          />
        </Text>

        {needsConversion && (
          <Alert
            icon={<IconInfoCircle size={16} />}
            color="blue"
            variant="light"
          >
            <Text size="sm">{t("conversion_alert")}</Text>
          </Alert>
        )}

        <Select
          label={
            <Group gap="xs">
              <span>{t("collection.label")}</span>
              {suggestedCollection && (
                <Badge
                  size="xs"
                  variant="light"
                  color="grape"
                  leftSection={<IconBooks size={10} />}
                >
                  {t("collection.series_detected")}
                </Badge>
              )}
            </Group>
          }
          description={
            suggestedCollection
              ? t("collection.suggested_desc", { series: suggestedCollection })
              : t("collection.default_desc")
          }
          placeholder={
            loadingCollections
              ? t("collection.loading")
              : t("collection.placeholder")
          }
          data={[
            { value: "", label: t("collection.none") },
            ...collections.map((c) => ({
              value: c,
              label: c,
            })),
            { value: "__new__", label: t("collection.create_new") },
          ]}
          value={showNewInput ? "__new__" : selectedCollection || ""}
          onChange={handleCollectionChange}
          disabled={loadingCollections || isUploading}
          searchable
          rightSection={loadingCollections ? <Loader size="xs" /> : undefined}
        />

        {showNewInput && (
          <TextInput
            label={t("new_collection.label")}
            placeholder={t("new_collection.placeholder")}
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
            disabled={isUploading}
          />
        )}

        <Group justify="flex-end" gap="sm" mt="md">
          <Button variant="default" onClick={onClose} disabled={isUploading}>
            {tCommon("actions.cancel")}
          </Button>
          <Button
            color="cyan"
            leftSection={<IconCloudUpload size={16} />}
            onClick={handleUpload}
            loading={isUploading}
            disabled={showNewInput && !newCollectionName.trim()}
          >
            {t("buttons.upload")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export default TolinoUploadDialog;
