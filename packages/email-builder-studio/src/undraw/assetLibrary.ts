import React from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import {
  IBLIS_UNDRAW_CATALOG,
  IBLIS_UNDRAW_COUNT,
  IBLIS_UNDRAW_LOADERS,
} from "./iblisUndrawCatalog";

export interface UndrawIllustration {
  id: string;
  title: string;
  tags: string[];
  exportName: string;
}

export const UNDRAW_CATALOG: UndrawIllustration[] = IBLIS_UNDRAW_CATALOG.map(
  (item) => ({
    id: item.id,
    title: item.title,
    tags: item.tags,
    exportName: item.exportName,
  })
);

export const UNDRAW_LIBRARY_COUNT = IBLIS_UNDRAW_COUNT;

export async function renderUndrawSvg(
  item: UndrawIllustration,
  color = "#6c63ff"
): Promise<string> {
  const loader = IBLIS_UNDRAW_LOADERS[item.exportName];
  if (!loader) {
    throw new Error(`SVG illustration ${item.exportName} is not registered.`);
  }

  const module = await loader();
  const Component = module[item.exportName] as
    | React.ComponentType<Record<string, unknown>>
    | undefined;
  if (!Component) {
    throw new Error(`SVG illustration ${item.exportName} could not be loaded.`);
  }

  return renderToStaticMarkup(
    React.createElement(Component, {
      "aria-label": item.title,
      role: "img",
      height: "auto",
      style: { width: "100%", height: "auto", display: "block" },
      primarycolor: color,
      accentcolor: "#3f3d56",
      skincolor: "#ffb9b9",
      haircolor: "#2f2e41",
    })
  );
}

export function sanitizeSvgForDataUri(svg: string): string {
  // A simple cleanup if needed, but encoding is usually enough
  return svg.replace(/[\r\n]+/g, " ");
}
