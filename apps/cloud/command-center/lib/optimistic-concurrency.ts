export interface VersionedResource {
  version: number;
}

export interface VersionedMutation {
  expected_version: number;
}

export function withExpectedVersion<T extends object>(resource: VersionedResource, mutation: T): T & VersionedMutation {
  if (!Number.isInteger(resource.version) || resource.version < 0) {
    throw new Error("A valid resource version is required for this mutation.");
  }
  return { ...mutation, expected_version: resource.version };
}
