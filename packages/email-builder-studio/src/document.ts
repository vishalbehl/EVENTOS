import type { EmailDocument } from "./types";

export type StudioNode = { type: string; data: { style?: Record<string, unknown>; props?: Record<string, unknown>; childrenIds?: string[]; [key: string]: unknown } };
export type ChildSlot = { ownerId: string; key: string; ids: string[] };

export const ROOT_ID = "root";
export const nodeOf = (document: EmailDocument, id: string) => (document as Record<string, StudioNode>)[id];

export function slotsOf(document: EmailDocument, ownerId: string): ChildSlot[] {
  const node = nodeOf(document, ownerId);
  if (!node) return [];
  if (ownerId === ROOT_ID) return [{ ownerId, key: "root", ids: [...(node.data.childrenIds ?? [])] }];
  if (node.type === "Container") return [{ ownerId, key: "children", ids: [...((node.data.props?.childrenIds as string[] | undefined) ?? [])] }];
  if (node.type === "ColumnsContainer") {
    const columns = (node.data.props?.columns as Array<{ childrenIds: string[] }> | undefined) ?? [];
    return columns.slice(0, Number(node.data.props?.columnsCount ?? 2)).map((column, index) => ({ ownerId, key: `column-${index}`, ids: [...column.childrenIds] }));
  }
  return [];
}

export function allSlots(document: EmailDocument): ChildSlot[] {
  const output: ChildSlot[] = [];
  const visit = (id: string) => {
    for (const slot of slotsOf(document, id)) {
      output.push(slot);
      slot.ids.forEach(visit);
    }
  };
  visit(ROOT_ID);
  return output;
}

export function parentSlot(document: EmailDocument, childId: string) {
  return allSlots(document).find((slot) => slot.ids.includes(childId));
}

export function writeSlot(document: EmailDocument, slot: ChildSlot, ids: string[]): EmailDocument {
  const owner = nodeOf(document, slot.ownerId);
  if (slot.key === "root") return { ...document, root: { ...owner, data: { ...owner.data, childrenIds: ids } } } as EmailDocument;
  if (slot.key === "children") return { ...document, [slot.ownerId]: { ...owner, data: { ...owner.data, props: { ...owner.data.props, childrenIds: ids } } } } as EmailDocument;
  const index = Number(slot.key.replace("column-", ""));
  const columns = [...((owner.data.props?.columns as Array<{ childrenIds: string[] }> | undefined) ?? [])];
  columns[index] = { childrenIds: ids };
  return { ...document, [slot.ownerId]: { ...owner, data: { ...owner.data, props: { ...owner.data.props, columns } } } } as EmailDocument;
}

export function descendants(document: EmailDocument, id: string): string[] {
  return slotsOf(document, id).flatMap((slot) => slot.ids.flatMap((child) => [child, ...descendants(document, child)]));
}

export function removeSubtree(document: EmailDocument, id: string): EmailDocument {
  const parent = parentSlot(document, id);
  let next = parent ? writeSlot(document, parent, parent.ids.filter((child) => child !== id)) : document;
  const copy = { ...(next as Record<string, StudioNode>) };
  for (const child of [id, ...descendants(document, id)]) delete copy[child];
  return copy as EmailDocument;
}

export function cloneSubtree(document: EmailDocument, id: string): { nodes: Record<string, StudioNode>; rootId: string } {
  const mapping = new Map<string, string>();
  const sourceIds = [id, ...descendants(document, id)];
  sourceIds.forEach((source) => mapping.set(source, `${source}-copy-${crypto.randomUUID().slice(0, 5)}`));
  const nodes: Record<string, StudioNode> = {};
  for (const sourceId of sourceIds) {
    const node = structuredClone(nodeOf(document, sourceId));
    if (node.data.childrenIds) node.data.childrenIds = node.data.childrenIds.map((child) => mapping.get(child) ?? child);
    if (node.type === "Container" && Array.isArray(node.data.props?.childrenIds)) node.data.props.childrenIds = (node.data.props.childrenIds as string[]).map((child) => mapping.get(child) ?? child);
    if (node.type === "ColumnsContainer" && Array.isArray(node.data.props?.columns)) node.data.props.columns = (node.data.props.columns as Array<{ childrenIds: string[] }>).map((column) => ({ childrenIds: column.childrenIds.map((child) => mapping.get(child) ?? child) }));
    nodes[mapping.get(sourceId)!] = node;
  }
  return { nodes, rootId: mapping.get(id)! };
}

export function breadcrumb(document: EmailDocument, id: string | null): string[] {
  if (!id) return ["Email"];
  const chain = [id];
  let current = id;
  while (current !== ROOT_ID) {
    const parent = parentSlot(document, current)?.ownerId;
    if (!parent) break;
    chain.unshift(parent);
    current = parent;
  }
  return chain.map((item) => item === ROOT_ID ? "Email" : nodeOf(document, item)?.type ?? "Block");
}
