export type AceternityAdapterStatus = 'source-synced' | 'builder-ready';

export interface AceternityCatalogItem {
  id: string;
  name: string;
  title: string;
  description: string;
  category: string;
  documentationUrl: string;
  registryUrl: string;
  previewUrl: string;
  dependencies: string[];
  registryDependencies: string[];
  files: string[];
  author: string;
  sourcePath: string;
  licenseUrl: string;
  adapterStatus: AceternityAdapterStatus;
}
