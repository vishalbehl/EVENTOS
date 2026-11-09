export type OrganizationKind = "NORMAL" | "EMC" | "CLIENT";
export type RelationshipState = "REQUESTED" | "ACTIVE" | "SUSPENDED" | "REJECTED" | "DETACHED";
export type RelationshipAction = "accept" | "reject" | "suspend" | "resume" | "detach" | "transfer";
export type ClientScope = { member_id?: string; workspace_id: string; event_id?: string | null; actions: string[] };
export type ClientRelationship = {
  id: string; emc_organization_id: string; client_organization_id: string;
  status: RelationshipState; version: number; policy_revision: number;
  approved_at?: string | null; created_at: string; scopes: ClientScope[]; available_actions: RelationshipAction[];
};
export type RelationshipPage = { items: ClientRelationship[]; next_cursor: string | null;
  organization_kind: "EMC" | "CLIENT"; role: string; grantable_actions: string[] };
export type ClientProvisionResult = { provisioning_id: string; client_organization_id: string; relationship_id: string;
  owner_member_id: string; owner_version: number; expires_at: string; invite_token?: string | null; replayed: boolean; delivery_mode: "MANUAL" };
export type ClientProvisionStatus = Omit<ClientProvisionResult, "invite_token" | "replayed" | "delivery_mode"> & {
  owner_accepted: boolean; owner_active: boolean; relationship_status: string };
