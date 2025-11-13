export interface IndexerSettings {
  baseUrl: string;
  newznabEnabled: boolean;
  newznabApiKey: string | null;
  newznabUrl: string;
  sabnzbdEnabled: boolean;
  sabnzbdApiKey: string | null;
  sabnzbdUrl: string;
  indexerCompletedDir: string;
  indexerIncompleteDir: string;
  indexerCategoryDir: boolean;
  indexerOnlyMode: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface IndexerSettingsUpdate {
  baseUrl?: string;
  newznabEnabled?: boolean;
  sabnzbdEnabled?: boolean;
  indexerCompletedDir?: string;
  indexerIncompleteDir?: string;
  indexerCategoryDir?: boolean;
  indexerOnlyMode?: boolean;
}

export interface RegenerateApiKeyRequest {
  service: "newznab" | "sabnzbd";
}

export interface RegenerateApiKeyResponse {
  apiKey: string;
  service: string;
}
