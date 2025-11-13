import { useState } from "react";
import { TextInput, ActionIcon } from "@mantine/core";
import { IconFolder } from "@tabler/icons-react";
import { FolderBrowser } from "./FolderBrowser";

interface FolderInputProps {
  label: string;
  value: string;
  onChange: (value: string, fromBrowser?: boolean) => void;
  onBlur?: () => void;
  placeholder?: string;
  description?: string;
  disabled?: boolean;
  showFiles?: boolean;
}

export function FolderInput({
  label,
  value,
  onChange,
  onBlur,
  placeholder = "/path/to/folder",
  description,
  disabled = false,
  showFiles = false,
}: FolderInputProps) {
  const [browserOpened, setBrowserOpened] = useState(false);

  const handleFolderSelect = (path: string) => {
    // Pass true to indicate this change is from the browser
    onChange(path, true);
  };

  return (
    <>
      <TextInput
        label={label}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value, false)}
        onBlur={onBlur}
        placeholder={placeholder}
        description={description}
        disabled={disabled}
        rightSection={
          <ActionIcon
            variant="subtle"
            onClick={() => setBrowserOpened(true)}
            disabled={disabled}
          >
            <IconFolder size="1rem" />
          </ActionIcon>
        }
        rightSectionWidth={42}
      />

      <FolderBrowser
        opened={browserOpened}
        onClose={() => setBrowserOpened(false)}
        onSelect={handleFolderSelect}
        initialPath={value || "/"}
        title={`Select ${label}`}
        showFiles={showFiles}
      />
    </>
  );
}
