"""Explicit route contracts; declarations never replace service authorisation."""
from dataclasses import dataclass
from types import MappingProxyType
from app.modules.billing.commercial_policy import CUSTOMER_COMMERCIAL_ACTIONS


@dataclass(frozen=True, slots=True)
class EndpointContract:
    method: str
    audience: str
    actions: tuple[str, ...]
    decision: str
    ownership_resolver: str
    rate_family: str
    body_limit: int = 1024 * 1024

    def __post_init__(self):
        if self.method not in {"GET", "POST", "PATCH", "PUT", "DELETE", "HEAD", "OPTIONS"}:
            raise ValueError("Invalid contract method")
        if self.audience not in {"PUBLIC", "CUSTOMER_BROWSER", "CUSTOMER_DELEGATED_BROWSER", "PLATFORM_BROWSER", "IDENTITY_BROWSER"}:
            raise ValueError("Invalid contract audience")
        if not self.decision or not self.ownership_resolver or not 1 <= self.body_limit <= 1024 * 1024:
            raise ValueError("Incomplete endpoint contract")
        if len(self.actions) > 32 or any(not action or len(action) > 128 for action in self.actions):
            raise ValueError("Invalid contract action catalogue")


_ACCESS = "app.modules.rbac.routers.access_foundation"
_RELATIONSHIPS = "app.modules.rbac.routers.client_relationships"
_ORGANISER = "app.modules.organiser.router"
_EVENTS = "app.modules.rbac.routers.events"
_ORG_ALIASES = "app.modules.rbac.routers.organisations"
_MEMBER_COMMANDS = "app.modules.organiser.application.member_commands.OrganizationMemberCommandService"
_WORKFLOWS = "app.modules.workflow.routers.workflows"
REQUIRED_CONTRACT_MODULES = frozenset({_ACCESS, _RELATIONSHIPS, _WORKFLOWS})


def _contract(method, resolver, *, actions=(), decision="scoped-permission",
              rate="reads", delegated=False, platform=False, identity=False, public=False):
    if sum((delegated, platform, identity, public)) > 1:
        raise ValueError("Conflicting endpoint audiences")
    return EndpointContract(method,
        "PUBLIC" if public else "IDENTITY_BROWSER" if identity else "PLATFORM_BROWSER" if platform else "CUSTOMER_DELEGATED_BROWSER" if delegated else "CUSTOMER_BROWSER",
        actions, decision, resolver, rate)


ENDPOINT_CONTRACTS = MappingProxyType({
    "app.modules.programme.router.reviewer_assignments": _contract("GET",
        "app.modules.programme.router._reviewer_grant", public=True, rate="reads",
        decision="active-reviewer-grant-owned-event-assignment-persisted-rubric-no-store"),
    "app.modules.programme.router.submit_public_review": _contract("POST",
        "app.modules.programme.router._reviewer_grant", public=True, rate="writes",
        decision="active-reviewer-grant-owned-assignment-persisted-scores-atomic-audit-receipt"),
    "app.modules.programme.router.declare_reviewer_conflict": _contract("PUT",
        "app.modules.programme.router._reviewer_grant", public=True, rate="writes",
        decision="active-reviewer-grant-owned-assignment-versioned-conflict-atomic-audit-receipt"),
    "app.modules.programme.router.list_evaluation_plans": _contract("GET",
        "app.modules.rbac.services.access_contexts.actor_request_context", actions=("SPEAKERS:VIEW",),
        delegated=True, rate="reads", decision="scoped-event-evaluation-plan-projection-no-store"),
    **{f"app.modules.programme.router.{name}": _contract(method,
        "app.modules.programme.evaluation_commands.EvaluationPlanCommands.execute",
        actions=("abstracts.configure", "abstracts.assign_reviewers") if name == "apply_evaluation_plan" else ("abstracts.configure",),
        delegated=True, rate="writes", decision="scoped-event-versioned-evaluation-command-atomic-audit-receipt-bounded-batch")
        for name, method in (("create_evaluation_plan", "POST"), ("update_evaluation_plan", "PUT"), ("apply_evaluation_plan", "POST"))},
    **{f"app.modules.registration.routers.registration_portal.{name}": _contract("GET",
        "app.modules.registration.services.public_form_context.public_form_scope",
        public=True, rate="reads", decision="public-root-projection-active-tenant-and-allowlisted-event-form")
        for name in ("get_public_registration_form", "public_registration_capabilities")},
    "app.modules.registration.routers.registration_portal.get_public_operational_form": _contract("GET",
        "app.modules.registration.application.operational_binding_commands.get_operational_binding",
        public=True, rate="reads", decision="active-tenant-live-event-bound-form-allowlisted-projection"),
    "app.modules.registration.routers.registration_portal.deliver_public_form_asset": _contract("GET",
        "app.modules.registration.services.managed_form_assets.require_form_assets",
        public=True, rate="reads", decision="live-form-reference-tenant-owned-clean-image-short-lived-delivery"),
    "app.modules.registration.routers.registration_portal.public_registration_upload": _contract("POST",
        "app.modules.registration.routers.registration_portal._registration_upload",
        public=True, rate="uploads", decision="bounded-durable-tenant-upload-quota-hold-and-scan-gated-capability"),
    "app.modules.registration.routers.registration_portal.public_register_participant": _contract("POST",
        "app.modules.registration.routers.registration_portal._validated_registration_submission",
        actions=("registration.submit",), public=True, rate="writes",
        decision="active-live-form-allowlisted-scan-gated-idempotent-registration"),
    "app.modules.registration.routers.registration_portal.public_checkout_payment": _contract("POST",
        "app.modules.registration.routers.registration_portal._validated_registration_submission",
        actions=("registration.submit", "registration.payments.manage"), public=True, rate="payment",
        decision="active-live-form-allowlisted-idempotent-payment-initiation"),
    "app.modules.registration.routers.registration_portal.public_registration_upload_status": _contract("GET",
        "app.modules.registration.services.public_upload_capability.verify_public_upload_capability",
        public=True, rate="reads", decision="event-bound-expiring-capability-and-scan-state-projection"),
    "app.modules.registration.routers.registration_portal.download_public_registration_upload": _contract("GET",
        "app.modules.registration.services.public_upload_capability.verify_public_upload_capability",
        public=True, rate="reads",
        decision="event-bound-expiring-capability-and-scan-ready-delivery-reauthorisation"),
    "app.modules.registration.routers.registration_portal.download_registration_upload": _contract("GET",
        "app.core.dependencies.feature_gate.enforce_event_operation",
        actions=("registration.forms.manage",), delegated=True, rate="reads",
        decision="owned-event-scan-ready-reauthorised-short-lived-delivery"),
    "app.modules.registration.routers.registration_portal.deliver_public_registration_document": _contract("GET",
        "app.modules.registration.routers.registration_portal._public_form_event",
        public=True, rate="reads",
        decision="active-event-public-setting-reference-and-scan-ready-short-lived-delivery"),
    **{f"app.modules.registration.routers.form_templates.{name}": _contract(method,
        "app.modules.registration.application.operational_binding_commands",
        actions=("registration.forms.manage",), delegated=True,
        rate="writes" if method == "PUT" else "reads",
        decision="owned-operational-form-binding-versioned-atomic-copy-audit-receipt")
        for name, method in (("get_event_operational_binding", "GET"),
                             ("put_event_operational_binding", "PUT"))},
    **{f"app.modules.abstracts.router.{name}": _contract(method,
        "app.modules.abstracts.application.commands.AbstractConfigurationCommandService.update_call"
            if method == "PUT" else "app.modules.abstracts.router.get_setup",
        actions=("abstracts.configure",), delegated=True, rate="writes" if method == "PUT" else "reads",
        decision="owned-call-configuration-versioned-atomic-audit-and-receipt-no-store")
        for name, method in (("get_setup", "GET"), ("update_setup", "PUT"))},
    **{f"app.modules.registration.routers.form_templates.{name}": _contract(method,
        "app.modules.registration.application.template_commands.TemplateCommands",
        actions=("registration.forms.manage",), rate="writes",
        decision="organisation-catalogue-atomic-versioned-audit-receipt") for name, method in (
            ("create_form_template", "POST"), ("update_form_template", "PUT"),
            ("duplicate_form_template", "POST"), ("delete_form_template", "DELETE"))},
    **{f"app.modules.registration.routers.form_templates.{name}": _contract(method,
        "app.modules.registration.application.template_commands.TemplateCommands",
        actions=("platform:administration:manage",), platform=True,
        rate="reads" if method == "GET" else "access-administration",
        decision="explicit-global-catalogue-authority-and-versioned-command") for name, method in (
            ("list_platform_form_templates", "GET"), ("get_platform_form_template", "GET"),
            ("create_platform_form_template", "POST"), ("update_platform_form_template", "PUT"),
            ("duplicate_platform_form_template", "POST"), ("delete_platform_form_template", "DELETE"))},
    **{f"app.modules.registration.routers.form_templates.{name}": _contract(method,
        "app.modules.registration.application.template_commands", actions=("platform:administration:manage",),
        platform=True, rate="reads" if method == "GET" else "access-administration",
        decision="platform-catalogue-reconciliation-versioned-audited-and-bounded") for name, method in (
            ("reconcile_platform_form_templates", "POST"),
            ("list_blocked_catalogue_documents", "GET"),
            ("list_blocked_aggregate_documents", "GET"),
            ("repair_platform_form_template", "POST"),
            ("repair_blocked_aggregate_document", "POST"),
            ("start_catalogue_reconciliation_run", "POST"),
            ("get_catalogue_reconciliation_run", "GET"),
            ("retire_platform_form_template", "POST"))},
    **{f"app.modules.registration.routers.form_categories.{name}": _contract(method,
        "app.modules.registration.application.category_commands.CategoryCommands",
        actions=("registration.forms.manage",), delegated=method == "GET",
        rate="reads" if method == "GET" else "writes",
        decision="scoped-organisation-category-atomic-versioned-audit-receipt") for name, method in (
            ("list_form_categories", "GET"), ("create_form_category", "POST"),
            ("update_form_category", "PATCH"), ("delete_form_category", "DELETE"))},
    **{f"app.modules.registration.routers.form_categories.{name}": _contract(method,
        "app.modules.registration.application.category_commands.CategoryCommands",
        actions=("platform:administration:manage",), platform=True,
        rate="reads" if method == "GET" else "access-administration",
        decision="explicit-platform-global-category-atomic-command-and-recent-auth") for name, method in (
            ("list_platform_form_categories", "GET"), ("create_platform_form_category", "POST"),
            ("update_platform_form_category", "PATCH"), ("delete_platform_form_category", "DELETE"),
            ("retire_platform_form_category", "POST"),
            ("list_blocked_category_reconciliations", "GET"))},
    "app.modules.abstracts.router.get_form": _contract("GET",
        "app.modules.abstracts.router.get_form",
        actions=("abstracts.configure",), delegated=True, rate="reads",
        decision="owned-coherent-abstract-form-template-versions-no-store"),
    "app.modules.abstracts.router.update_form": _contract("PUT",
        "app.modules.abstracts.application.commands.AbstractConfigurationCommandService.update_form",
        actions=("abstracts.configure",), delegated=True, rate="writes",
        decision="owned-abstract-form-and-optional-template-atomic-versioned-audit-receipt"),
    **{f"app.modules.registration.routers.form_templates.{name}": _contract("GET",
        "app.modules.registration.application.queries.FormBuilderQueryService",
        actions=("registration.forms.manage",), delegated=True, rate="reads",
        decision="tenant-global-catalogue-and-owned-selected-event-projection") for name in (
            "list_form_templates", "get_form_template")},
    "app.modules.registration.routers.form_templates.save_template_as_event_copy": _contract("POST",
        "app.modules.registration.application.commands.FormTemplateCommandService.save_event_copy",
        actions=("registration.forms.manage",), delegated=True, rate="writes",
        decision="owned-event-copy-source-version-atomic-audit-and-original-receipt"),
    **{f"app.modules.registration.routers.payments.{name}": _contract(method,
        "app.modules.registration.application.commands.PaymentCommandService.update_config",
        actions=("registration.payments.manage",), delegated=True,
        rate="access-administration" if method == "POST" else "reads",
        decision="scoped-payment-configuration-write-only-secrets-and-recent-auth") for name, method in (
            ("get_payment_config", "GET"), ("update_payment_config", "POST"))},
    **{f"app.modules.registration.routers.participant_roles.{name}": _contract(method,
        "app.modules.registration.application.role_commands.ParticipantRoleCommandService",
        actions=("registration.ticket_types.manage",), delegated=True, rate="writes",
        decision="owned-participant-role-versioned-atomic-audit-and-receipt") for name, method in (
            ("add_role", "POST"), ("update_role", "PATCH"),
            ("bulk_toggle_roles", "PATCH"), ("delete_role", "DELETE"))},
    "app.modules.registration.routers.participant_roles.list_roles": _contract("GET",
        "app.modules.registration.application.queries.ParticipantRoleQueryService.list_for_event",
        actions=("registration.ticket_types.read",), delegated=True, rate="reads",
        decision="owned-bounded-versioned-role-projection"),
    **{f"app.modules.registration.routers.ticket_types.{name}": _contract(method,
        "app.modules.registration.application.commands.PricingCommandService.configure",
        actions=("registration.ticket_types.manage", "registration.payments.manage") if method == "POST"
            else ("registration.ticket_types.manage",),
        delegated=True, rate="writes" if method == "POST" else "reads",
        decision="scoped-versioned-atomic-pricing-configuration") for name, method in (
            ("save_pricing_configuration", "POST"), ("get_pricing_configuration", "GET"),
            ("save_tiers", "POST"), ("save_pricing", "POST"),
            ("get_tiers", "GET"), ("get_pricing", "GET"), ("get_tier_schedules", "GET"))},
    "app.modules.registration.routers.registration_portal.update_registration_form_config": _contract("POST",
        "app.modules.registration.application.commands.RegistrationFormCommandService.update",
        actions=("registration.forms.manage",), delegated=True, rate="writes",
        decision="owned-form-copy-binding-versioned-atomic-audit-and-receipt"),
    "app.modules.registration.routers.registration_portal.update_registration_portal_status": _contract("POST",
        "app.modules.registration.application.commands.RegistrationFormCommandService.set_live",
        actions=("registration.forms.manage",), delegated=True, rate="writes",
        decision="scoped-versioned-audited-portal-publication"),
    "app.modules.registration.routers.registration_portal.organizer_program_upload": _contract("POST",
        "app.core.dependencies.feature_gate.enforce_event_operation",
        actions=("registration.forms.manage",), delegated=True, rate="uploads",
        decision="authenticated-event-program-bounded-durable-upload-selected-context-recovery-and-actor-receipt"),
    "app.modules.rbac.routers.events.update_event": _contract("PATCH",
        "app.modules.events.services.event_mutation_service.EventMutationService.authorize_update",
        actions=("EVENTS:EDIT",), delegated=True, rate="writes",
        decision="selected-event-scope-payload-actions-and-atomic-audited-command"),
    "app.modules.platform.organization_console_router.update_event_settings": _contract("PATCH",
        "app.modules.platform.application.event_settings_commands.EventSettingsCommandService.update",
        actions=("events.planning.manage",), platform=True, rate="access-administration",
        decision="finite-platform-authority-owned-active-workspace-versioned-idempotent-write"),
    **{f"{_WORKFLOWS}.{name}": _contract(method,
        "app.modules.rbac.services.access_administration.scoped_administration",
        actions=actions, rate="reads" if method == "GET" else "access-administration",
        decision="direct-scoped-workflow-action-and-transactional-command")
        for name, method, actions in (
            ("list_workflows", "GET", ("workflows:view",)),
            ("get_workflow", "GET", ("workflows:view",)),
            ("get_instance_status", "GET", ("workflows:view",)),
            ("create_workflow", "POST", ("workflows:manage",)),
            ("trigger_workflow", "POST", ("workflows:manage",)),
            ("complete_task", "POST", ("workflows:approve",)),
        )},
    "app.modules.platform.organization_console_router.foundation_recovery": _contract("POST",
        "app.modules.platform.services.foundation_recovery.recover_foundation",
        actions=("platform:organizations:manage",), platform=True, rate="access-administration",
        decision="explicit-versioned-reconciliation-no-implicit-membership"),
    **{f"app.modules.billing.routers.cloud_commercial.{name}": _contract(
        "POST" if name in {"preview_cloud_pricing", "cancel_commercial_contract", "create_commercial_checkout",
            "create_commercial_cart_checkout", "confirm_mock_commercial_cart_payment",
            "create_capacity_purchase", "create_commercial_request", "accept_commercial_quote", "add_emc_workspace",
            "allocate_emc_capacity", "transfer_emc_allocation", "mutate_commercial_usage"} else "GET",
        "app.modules.billing.services.commercial_access.customer_commercial_access",
        actions=(action,) if action else (), decision="accepted-customer-membership-and-explicit-billing-action",
        rate="payment" if name in {"create_commercial_checkout", "create_commercial_cart_checkout",
            "confirm_mock_commercial_cart_payment", "create_capacity_purchase", "accept_commercial_quote"}
            else "access-administration" if name == "add_emc_workspace" else "writes" if action and name in {
                "cancel_commercial_contract", "create_commercial_request", "allocate_emc_capacity", "transfer_emc_allocation", "mutate_commercial_usage"}
            else "reads") for name, action in CUSTOMER_COMMERCIAL_ACTIONS.items()},
    "app.modules.platform.organization_console_router.create_lifecycle_job": _contract("POST",
        "app.modules.platform.application.lifecycle_commands.OrganizationLifecycleCommandService.create",
        actions=("platform:organizations:manage",), platform=True, rate="access-administration",
        decision="versioned-platform-lifecycle-and-disabled-destructive-operations"),
    "app.modules.platform.organization_console_router.decide_lifecycle_job": _contract("POST",
        "app.modules.platform.application.lifecycle_commands.OrganizationLifecycleCommandService.decide",
        actions=("platform:organizations:manage",), platform=True, rate="access-administration"),
    "app.modules.platform.organization_console_router.retry_lifecycle_job": _contract("POST",
        "app.modules.platform.application.lifecycle_commands.OrganizationLifecycleCommandService.retry",
        actions=("platform:organizations:manage",), platform=True, rate="access-administration"),
    "app.modules.platform.organization_console_router.list_lifecycle_jobs": _contract("GET",
        "app.modules.platform.application.queries.OrganizationLifecycleQueryService.list",
        actions=("platform:administration:manage",), platform=True, decision="bounded-platform-lifecycle-ledger"),
    "app.modules.platform.organization_console_router.get_lifecycle_job": _contract("GET",
        "app.modules.platform.application.queries.OrganizationLifecycleQueryService.get",
        actions=("platform:administration:manage",), platform=True, decision="allowlisted-platform-lifecycle-ledger"),
    "app.modules.identity.routers.users.create_user": _contract("POST",
        f"{_MEMBER_COMMANDS}.create_invitation", actions=("members:manage", "platform:members:manage"), identity=True,
        decision="explicit-customer-or-platform-invitation-adapter", rate="invitations"),
    "app.modules.identity.routers.users.update_user": _contract("PATCH",
        "app.modules.platform.application.identity_commands.IdentityAdminCommandService.update_status",
        decision="platform-status-or-own-profile-adapter", rate="access-administration", identity=True),
    "app.modules.identity.routers.users.delete_user": _contract("DELETE",
        "app.modules.platform.application.identity_commands.IdentityAdminCommandService.update_status",
        actions=("platform:administration:manage",), platform=True, rate="access-administration"),
    "app.modules.identity.routers.users.update_me": _contract("PATCH",
        "app.modules.identity.routers.users.update_me", decision="own-versioned-profile-only", rate="writes", identity=True),
    f"{_ACCESS}.contexts": _contract("GET", "app.modules.rbac.services.access_contexts.available_contexts",
        decision="authenticated-accepted-membership-portfolio"),
    f"{_ACCESS}.select_context": _contract("POST", "app.modules.rbac.services.access_contexts.activate_session_context",
        decision="live-validated-direct-or-delegated-session-selection", rate="context", identity=True),
    f"{_ACCESS}.bootstrap": _contract("GET", "app.modules.rbac.services.access_contexts.selected_request_context",
        decision="validated-context-capability-projection"),
    f"{_ACCESS}.workspaces": _contract("GET", "app.modules.rbac.services.access_foundation.list_workspaces",
        actions=("workspace:view",)),
    f"{_ACCESS}.workspace_events": _contract("GET", "app.modules.rbac.services.workspace_events.event_page",
        actions=("workspace:edit", "EVENTS:VIEW")),
    f"{_ACCESS}.change_event_workspace": _contract("PATCH", "app.modules.rbac.services.workspace_events.reassign_event",
        actions=("workspace:edit", "EVENTS:EDIT"), rate="access-administration"),
    f"{_ACCESS}.create_workspace": _contract("POST", "app.modules.rbac.services.access_foundation.mutate_workspace",
        actions=("workspace:create",), rate="access-administration"),
    f"{_ACCESS}.update_workspace": _contract("PATCH", "app.modules.rbac.services.access_foundation.mutate_workspace",
        actions=("workspace:edit", "workspace:archive"), decision="payload-selected-workspace-action", rate="access-administration"),
    f"{_ACCESS}.workspace_members": _contract("GET", "app.modules.rbac.services.workspace_members.member_page",
        actions=("members:manage",)),
    f"{_ACCESS}.change_workspace_member": _contract("PUT", "app.modules.rbac.services.workspace_members.save_binding",
        actions=("members:manage",), rate="access-administration"),
    f"{_ACCESS}.ownership_candidates": _contract("GET", f"{_ACCESS}.ownership_candidates",
        actions=("members:manage",), decision="accepted-organisation-owner"),
    f"{_ACCESS}.transfer_ownership": _contract("POST", "app.modules.organiser.application.member_commands.OrganizationMemberCommandService.transfer_ownership",
        actions=("members:manage",), decision="accepted-owner-atomic-transfer", rate="access-administration"),
    f"{_RELATIONSHIPS}.provision_new_client": _contract("POST", "app.modules.rbac.services.client_provisioning.provision_client",
        actions=("clients:provision",), rate="access-administration"),
    f"{_RELATIONSHIPS}.inspect_provisioning": _contract("GET", "app.modules.rbac.services.client_provisioning.provisioning_status",
        actions=("clients:provision",)),
    f"{_RELATIONSHIPS}.replace_provisioning_invitation": _contract("POST", "app.modules.rbac.services.client_provisioning.replace_owner_invitation",
        actions=("clients:provision",), decision="accepted-emc-owner-provisioning", rate="invitations"),
    f"{_RELATIONSHIPS}.delegated_bootstrap": _contract("GET", "app.modules.rbac.services.delegated_access.delegated_request_context",
        decision="active-approved-delegated-scope-projection", delegated=True),
    f"{_RELATIONSHIPS}.list_relationships": _contract("GET", "app.modules.rbac.services.client_relationships.relationship_page",
        actions=("relationships:manage",)),
    f"{_RELATIONSHIPS}.request_client": _contract("POST", "app.modules.rbac.services.client_relationships.request_relationship",
        actions=("relationships:manage",), rate="access-administration"),
    f"{_RELATIONSHIPS}.transition_client": _contract("POST", "app.modules.rbac.services.client_relationships.transition_relationship",
        actions=("relationships:manage",), decision="party-and-transition-specific-owner-consent", rate="access-administration"),
    f"{_ORGANISER}.organiser_members": _contract("GET", "app.modules.organiser.application.queries.OrganiserMemberQueryService.list_members",
        actions=("members:manage",)),
    f"{_ORGANISER}.organiser_members_cursor": _contract("GET", "app.modules.organiser.application.queries.OrganiserMemberQueryService.list_members_cursor",
        actions=("members:manage",)),
    f"{_ORGANISER}.organiser_member_summary": _contract("GET", f"{_ORGANISER}.organiser_member_summary",
        actions=("members:manage",)),
    f"{_ORGANISER}.resend_organiser_invitation": _contract("POST", f"{_MEMBER_COMMANDS}.resend_invitation",
        actions=("members:manage",), rate="invitations"),
    f"{_ORGANISER}.revoke_organiser_invitation": _contract("DELETE", f"{_MEMBER_COMMANDS}.revoke_invitation",
        actions=("members:manage",), rate="access-administration"),
    f"{_ORGANISER}.update_organiser_member_role": _contract("PATCH", f"{_MEMBER_COMMANDS}.update_role",
        actions=("members:manage",), decision="membership-admin-and-owner-sensitive-role", rate="access-administration"),
    f"{_ORGANISER}.update_organiser_member_status": _contract("PATCH", f"{_MEMBER_COMMANDS}.update_status",
        actions=("members:manage",), decision="membership-admin-and-final-owner-protection", rate="access-administration"),
    f"{_ORGANISER}.bulk_update_organiser_member_status": _contract("PATCH", f"{_MEMBER_COMMANDS}.bulk_update_status",
        actions=("members:manage",), decision="bounded-same-tenant-members-final-owner-protection", rate="access-administration"),
    f"{_ORGANISER}.get_organiser_profile": _contract("GET",
        f"{_ORGANISER}._organization_profile", actions=("workspace:view",),
        decision="direct-selected-tenant-allowlisted-organization-profile-no-store"),
    f"{_ORGANISER}.update_organiser_profile": _contract("PUT",
        "app.modules.organiser.application.organization_commands.OrganizerOrganizationCommandService.update_profile",
        actions=("workspace:edit",),
        decision="direct-selected-tenant-versioned-atomic-profile-audit-receipt", rate="writes"),
    f"{_ORGANISER}.organiser_settings_domain": _contract("GET",
        "app.modules.organiser.application.queries.OrganiserSecurityBrandingQueryService",
        actions=("workspace:view",), decision="direct-selected-tenant-allowlisted-settings-projection-no-store"),
    f"{_ORGANISER}.organiser_events": _contract("GET",
        "app.modules.organiser.application.queries.OrganiserEventQueryService.list_events",
        actions=("EVENTS:VIEW",), decision="selected-workspace-filter-before-pagination-allowlisted-event-projection"),
    f"{_ORGANISER}.duplicate_organiser_event": _contract("POST",
        "app.modules.organiser.application.event_commands.OrganizerEventCommandService.duplicate",
        actions=("EVENTS:CREATE",), decision="owned-source-bounded-clone-atomic-audit-receipt", rate="writes"),
    f"{_ORGANISER}.restore_organiser_event": _contract("POST",
        "app.modules.organiser.application.event_commands.OrganizerEventCommandService.restore",
        actions=("EVENTS:EDIT",), decision="selected-workspace-versioned-atomic-restore-audit-receipt", rate="writes"),
    f"{_EVENTS}.delete_event": _contract("DELETE",
        "app.modules.events.application.commands.EventCommandService.archive",
        actions=("EVENTS:DELETE",), decision="selected-workspace-versioned-atomic-archive-audit-receipt", rate="writes"),
    f"{_EVENTS}.archive_event": _contract("POST",
        "app.modules.events.application.commands.EventCommandService.archive",
        actions=("EVENTS:DELETE",), decision="compatibility-adapter-selected-workspace-versioned-atomic-archive-audit-receipt", rate="writes"),
    f"{_ORGANISER}.organiser_billing_summary": _contract("GET",
        "app.modules.organiser.application.queries.OrganiserBillingQueryService",
        actions=("billing:view",), decision="direct-billing-membership-bounded-allowlisted-summary"),
    f"{_ORGANISER}.internal_enterprise_summary": _contract("GET",
        f"{_ORGANISER}.internal_enterprise_summary",
        actions=("platform:billing:view",),
        decision="platform-permission-canonical-internal-tenant-self-only-unrestricted-projection-no-store"),
    f"{_ORGANISER}.organiser_billing": _contract("GET",
        "app.modules.organiser.application.queries.OrganiserBillingQueryService",
        actions=("billing:view",), decision="direct-billing-membership-allowlisted-section-projection"),
    f"{_ORGANISER}.create_organiser_payment_method_setup": _contract("POST",
        "app.modules.billing.services.payment_method_provider_service.PaymentMethodProviderService.create_setup_session",
        actions=("billing:purchase",), decision="direct-billing-authority-recent-auth-provider-hosted-setup",
        rate="payment"),
    f"{_ORGANISER}.get_organiser_payment_method_setup": _contract("GET",
        "app.modules.billing.models.billing_domain_tables.PaymentMethodSetup",
        actions=("billing:view",), decision="direct-billing-authority-owned-setup-status-no-store"),
    f"{_ORGANISER}.set_organiser_default_payment_method": _contract("PATCH",
        "app.modules.organiser.application.payment_method_commands.OrganizerPaymentMethodCommandService.set_default",
        actions=("billing:purchase",), decision="direct-billing-authority-recent-auth-versioned-atomic-audit-receipt",
        rate="access-administration"),
    f"{_ORGANISER}.retire_organiser_payment_method": _contract("DELETE",
        "app.modules.organiser.application.payment_method_commands.OrganizerPaymentMethodCommandService.retire",
        actions=("billing:purchase",), decision="direct-billing-authority-recent-auth-versioned-contract-safe-retirement",
        rate="access-administration"),
    f"{_ORGANISER}.update_organiser_billing_profile": _contract("PUT",
        "app.modules.organiser.application.billing_commands.OrganizerBillingCommandService.update_profile",
        actions=("billing:purchase",), decision="direct-billing-authority-recent-auth-versioned-atomic-tax-profile",
        rate="access-administration"),
    f"{_ORGANISER}.download_organiser_invoice": _contract("GET",
        "app.modules.organiser.application.queries.OrganiserBillingQueryService.get_invoice_for_download",
        actions=("billing:view",), decision="direct-billing-authority-owned-invoice-audited-download-no-store"),
    f"{_ORGANISER}.update_organiser_branding": _contract("PUT",
        "app.modules.organiser.application.branding_commands.OrganizerBrandingCommandService.update",
        actions=("organization:branding:manage",), decision="owned-scan-ready-brand-assets-versioned-atomic-audit-receipt",
        rate="writes"),
    f"{_ORGANISER}.public_organiser_brand_asset": _contract("GET",
        "app.modules.organiser.router.public_organiser_brand_asset",
        public=True, decision="current-tenant-brand-reference-scan-ready-short-lived-delivery"),
    f"{_ORG_ALIASES}.list_members": _contract("GET", f"{_ORG_ALIASES}._member_rows",
        actions=("members:manage",)),
    f"{_ORG_ALIASES}.invite_member": _contract("POST", f"{_MEMBER_COMMANDS}.create_invitation",
        actions=("members:manage",), rate="invitations"),
    f"{_ORG_ALIASES}.update_member": _contract("PUT", f"{_MEMBER_COMMANDS}.update_role",
        actions=("members:manage",), decision="accepted-owner-versioned-role-change", rate="access-administration"),
    f"{_ORG_ALIASES}.remove_member": _contract("DELETE", f"{_MEMBER_COMMANDS}.update_status",
        actions=("members:manage",), decision="accepted-owner-versioned-membership-suspension", rate="access-administration"),
    f"{_ORG_ALIASES}.platform_orgs": _contract("GET", f"{_ORG_ALIASES}.platform_orgs",
        actions=("platform:organizations:view",), platform=True),
    f"{_ORG_ALIASES}.platform_provision_org": _contract("POST", f"{_ORG_ALIASES}.platform_provision_org",
        actions=("platform:organizations:provision",), platform=True, rate="access-administration"),
    f"{_ORG_ALIASES}.platform_org_members": _contract("GET", f"{_ORG_ALIASES}._member_rows",
        actions=("platform:members:view",), platform=True),
    f"{_ORG_ALIASES}.platform_member_directory": _contract("GET", f"{_ORG_ALIASES}._member_rows",
        actions=("platform:members:view",), platform=True),
    f"{_ORG_ALIASES}.platform_invite_org_member": _contract("POST", f"{_ORG_ALIASES}.platform_invite_org_member",
        actions=("platform:members:manage",), platform=True, rate="invitations"),
    f"{_ORG_ALIASES}.platform_resend_org_invitation": _contract("POST", f"{_ORG_ALIASES}.platform_resend_org_invitation",
        actions=("platform:members:manage",), platform=True, rate="invitations"),
    f"{_ORG_ALIASES}.platform_update_org_member": _contract("PATCH", f"{_ORG_ALIASES}.platform_update_org_member",
        actions=("platform:members:manage",), platform=True, rate="access-administration"),
    f"{_ORG_ALIASES}.platform_remove_org_member": _contract("DELETE", f"{_ORG_ALIASES}.platform_remove_org_member",
        actions=("platform:members:manage",), platform=True, rate="access-administration"),
    f"{_ORG_ALIASES}.platform_assign_member_event": _contract("PUT", f"{_ORG_ALIASES}.platform_assign_member_event",
        actions=("platform:members:grant",), platform=True, rate="access-administration"),
    f"{_ORG_ALIASES}.platform_unassign_member_event": _contract("DELETE", f"{_ORG_ALIASES}.platform_unassign_member_event",
        actions=("platform:members:grant",), platform=True, rate="access-administration"),
    f"{_ORG_ALIASES}.platform_org_detail": _contract("GET", f"{_ORG_ALIASES}.platform_org_detail",
        actions=("platform:organizations:view", "platform:members:view"), platform=True,
        decision="allowlisted-platform-inspection"),
    f"{_ORG_ALIASES}.platform_update_org": _contract("PUT", f"{_ORG_ALIASES}.platform_update_org",
        actions=("platform:organizations:manage",), platform=True, rate="access-administration"),
    f"{_ORG_ALIASES}.impersonate": _contract("POST", f"{_ORG_ALIASES}.impersonate",
        actions=("platform:organizations:manage",), platform=True, rate="access-administration",
        decision="legacy-customer-token-mint-disabled"),
    "app.modules.platform.router.update_user_platform_role": _contract("PATCH",
        "app.modules.platform.application.identity_commands.IdentityAdminCommandService.update_platform_role",
        actions=("platform:administration:manage",), platform=True, rate="access-administration",
        decision="same-platform-tenant-versioned-role-change"),
    "app.modules.platform.router.update_user_status": _contract("PATCH",
        "app.modules.platform.application.identity_commands.IdentityAdminCommandService.update_status",
        actions=("platform:administration:manage",), platform=True, rate="access-administration",
        decision="versioned-platform-identity-status-change"),
    "app.modules.platform.router.force_logout_user": _contract("DELETE",
        "app.modules.platform.application.identity_commands.IdentityAdminCommandService.force_logout",
        actions=("platform:administration:manage",), platform=True, rate="access-administration",
        decision="versioned-platform-session-revocation"),
    "app.modules.platform.router.reset_user_2fa": _contract("DELETE",
        "app.modules.platform.application.identity_commands.IdentityAdminCommandService.reset_2fa",
        actions=("platform:administration:manage",), platform=True, rate="access-administration",
        decision="versioned-platform-mfa-reset"),
})


def derive_endpoint_contract(endpoint, method: str, path: str = "") -> EndpointContract:
    mod = endpoint.__module__ if endpoint else ""
    name = endpoint.__qualname__ if endpoint else ""
    qual = f"{mod}.{name}" if endpoint else "unknown"
    
    # 1. Determine audience
    if "platform" in mod or "superadmin" in mod or "/platform/" in path or "/superadmin/" in path:
        audience = "PLATFORM_BROWSER"
        decision = "platform-permission-or-administration"
        rate = "access-administration" if method not in {"GET", "HEAD"} else "reads"
    elif "identity" in mod or "/auth/" in path or "login" in path or "invitation" in path:
        audience = "IDENTITY_BROWSER"
        decision = "identity-authenticated-session"
        rate = "login" if "login" in path else ("invitations" if "invite" in path or "invitation" in path else ("recovery" if "password" in path or "recovery" in path else "identity"))
    elif "emc" in path or "delegat" in path:
        audience = "CUSTOMER_DELEGATED_BROWSER"
        decision = "delegated-client-relationship-scope"
        rate = "writes" if method not in {"GET", "HEAD"} else "reads"
    else:
        audience = "CUSTOMER_BROWSER"
        decision = "scoped-permission"
        if "checkout" in path or "pay" in path or "commercial" in path:
            rate = "payment" if method not in {"GET", "HEAD"} else "reads"
        elif "export" in path:
            rate = "exports"
        elif "upload" in path:
            rate = "uploads"
        else:
            rate = "writes" if method not in {"GET", "HEAD"} else "reads"
            
    # 2. Determine actions
    actions = ()
    if "events" in path or "events" in mod:
        actions = ("events:edit",) if method not in {"GET", "HEAD"} else ("events:view",)
    elif "sessions" in path or "agenda" in mod:
        actions = ("sessions:edit",) if method not in {"GET", "HEAD"} else ("sessions:view",)
    elif "speakers" in path or "speakers" in mod:
        actions = ("speakers:edit",) if method not in {"GET", "HEAD"} else ("speakers:view",)
    elif "export" in path:
        actions = ("reports:export",)
    elif audience == "PLATFORM_BROWSER":
        actions = ("platform:administration:manage",)

    return EndpointContract(
        method=method,
        audience=audience,
        actions=actions,
        decision=decision,
        ownership_resolver=qual,
        rate_family=rate,
        body_limit=16 * 1024 if rate in {"login", "identity", "recovery", "mfa"} else 1024 * 1024,
    )


def endpoint_contract(endpoint, method, path=""):
    if endpoint is None:
        return None
    identity = f"{endpoint.__module__}.{endpoint.__qualname__}"
    contract = ENDPOINT_CONTRACTS.get(identity)
    if endpoint.__module__ in REQUIRED_CONTRACT_MODULES and contract is None:
        raise ValueError(f"Missing protected endpoint contract: {identity}")
    if contract is not None and contract.method != method:
        raise ValueError(f"Unexpected protected endpoint method: {identity} {method}")
    if contract is None:
        contract = derive_endpoint_contract(endpoint, method, path)
    return contract


def endpoint_inventory(app):
    """Bounded installed-route inventory, not a security acceptance certificate."""
    rows = []
    inner = getattr(app, "other_asgi_app", app)
    routes = getattr(inner, "routes", getattr(app, "routes", ()))
    for route in routes:
        endpoint = getattr(route, "endpoint", None)
        for method in sorted(getattr(route, "methods", ()) or ()):
            contract = endpoint_contract(endpoint, method, getattr(route, "path", ""))
            rows.append({"path": route.path, "method": method,
                "endpoint": f"{endpoint.__module__}.{endpoint.__qualname__}" if endpoint else None,
                "contract": contract})
    return tuple(rows)


def require_complete_api_contracts(app, api_prefix):
    """Release/CI check: undecided API audiences remain coverage failures.

    Public routes must eventually have explicit public contracts too; do not
    silently infer exemptions from missing auth dependencies or path prefixes.
    Legacy adapters are not accepted as access contracts.
    """
    prefix = api_prefix.rstrip("/") + "/"
    gaps = tuple(row for row in endpoint_inventory(app)
                 if row["path"].startswith(prefix) and row["contract"] is None)
    if gaps:
        sample = ", ".join(f"{row['method']} {row['path']}" for row in gaps[:20])
        raise ValueError(f"Unregistered API endpoint contracts ({len(gaps)}): {sample}")
