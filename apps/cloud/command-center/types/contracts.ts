import type { components, operations, paths } from "./openapi.generated";

export type BackendSchemas = components["schemas"];
export type BackendSchema<Name extends keyof BackendSchemas> = BackendSchemas[Name];
export type BackendPaths = paths;
export type BackendOperations = operations;
