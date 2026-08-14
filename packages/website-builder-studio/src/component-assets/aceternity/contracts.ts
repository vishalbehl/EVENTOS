import { ACETERNITY_CATALOG } from './catalog.generated';
import {
  ACETERNITY_BUILDER_ASSETS,
  ACETERNITY_FIDELITY_REVIEWED_COMPONENT_NAMES,
  ACETERNITY_BUILDER_MANIFESTS,
  ACETERNITY_BUILDER_TYPES,
} from './adapters';

export interface AceternityAdapterDiagnostic {
  code: string;
  component?: string;
  message: string;
}

export function validateAceternityAdapterContracts(): AceternityAdapterDiagnostic[] {
  const diagnostics: AceternityAdapterDiagnostic[] = [];
  const catalogNames = new Set(ACETERNITY_CATALOG.map(item => item.name));
  const assetIds = new Set<string>();
  const manifestIds = new Set<string>();
  const typeIds = new Set(ACETERNITY_BUILDER_TYPES);

  ACETERNITY_BUILDER_ASSETS.forEach(asset => {
    if (assetIds.has(asset.id)) diagnostics.push({ code: 'DUPLICATE_ASSET', component: asset.id, message: `Duplicate builder asset ${asset.id}.` });
    assetIds.add(asset.id);
    if (!asset.html.trim()) diagnostics.push({ code: 'EMPTY_HTML', component: asset.id, message: `${asset.id} has no canvas HTML.` });
    if (!asset.html.includes(`data-gjs-type="${asset.id}"`)) diagnostics.push({ code: 'MISSING_COMPONENT_TYPE', component: asset.id, message: `${asset.id} does not preserve its GrapesJS component type.` });
    if (!asset.html.includes('data-aceternity-name=')) diagnostics.push({ code: 'MISSING_PROVENANCE', component: asset.id, message: `${asset.id} has no Aceternity provenance attribute.` });
  });

  ACETERNITY_BUILDER_MANIFESTS.forEach(manifest => {
    if (manifestIds.has(manifest.id)) diagnostics.push({ code: 'DUPLICATE_MANIFEST', component: manifest.id, message: `Duplicate manifest ${manifest.id}.` });
    manifestIds.add(manifest.id);
    if (!manifest.schema.groups.some(group => group.properties.length > 0)) diagnostics.push({ code: 'EMPTY_SETTINGS', component: manifest.id, message: `${manifest.id} has no editable properties.` });
    manifest.schema.groups.flatMap(group => group.properties).forEach(property => {
      if (!property.target) diagnostics.push({ code: 'MISSING_PROPERTY_TARGET', component: manifest.id, message: `${manifest.id}.${property.id} has no write target.` });
    });
  });

  ACETERNITY_FIDELITY_REVIEWED_COMPONENT_NAMES.forEach(name => {
    const id = `aceternity-${name}`;
    if (!catalogNames.has(name)) diagnostics.push({ code: 'MISSING_CATALOG_SOURCE', component: id, message: `${id} is not present in the synced official catalog.` });
    if (!assetIds.has(id)) diagnostics.push({ code: 'MISSING_ASSET', component: id, message: `${id} has no insertable asset.` });
    if (!manifestIds.has(id)) diagnostics.push({ code: 'MISSING_MANIFEST', component: id, message: `${id} has no inspector manifest.` });
    if (!typeIds.has(id)) diagnostics.push({ code: 'MISSING_TYPE', component: id, message: `${id} is not registered as a canvas type.` });
  });

  return diagnostics;
}

export const ACETERNITY_ADAPTER_DIAGNOSTICS = validateAceternityAdapterContracts();

if (ACETERNITY_ADAPTER_DIAGNOSTICS.length > 0) {
  throw new Error(`Invalid Aceternity builder adapters: ${ACETERNITY_ADAPTER_DIAGNOSTICS.map(item => item.message).join(' ')}`);
}
