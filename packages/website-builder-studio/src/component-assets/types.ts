export type WebsiteComponentAssetKind = 'component' | 'section' | 'template';

export interface WebsiteTemplatePageAsset {
  id: string;
  name: string;
  slug: string;
  isHomePage: boolean;
  html: string;
  seoTitle?: string;
  seoDescription?: string;
}

export interface WebsiteComponentAsset {
  id: string;
  name: string;
  kind: WebsiteComponentAssetKind;
  group: string;
  description: string;
  tags: string[];
  preview: {
    accent: string;
    background: string;
    title: string;
    subtitle: string;
  };
  html: string;
  json: {
    components: unknown[];
    css?: string;
  };
  template?: {
    pages: WebsiteTemplatePageAsset[];
    theme?: {
      primary: string;
      secondary: string;
      background: string;
      surface: string;
      card: string;
      border?: string;
      textOnPrimary?: string;
      fontHeading?: string;
      fontBody?: string;
      radius?: string;
    };
  };
}
