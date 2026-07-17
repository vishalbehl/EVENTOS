# app/modules/platform/permissions/constants.py

DEFAULT_PERMISSIONS = [
    {"code": "organizations.view", "name": "View Organizations", "module": "ORGANIZATIONS", "description": "Can view organization registry, profiles, and billing summaries"},
    {"code": "organizations.create", "name": "Create Organizations", "module": "ORGANIZATIONS", "description": "Can register new organizations / tenants on the platform"},
    {"code": "quotes.approve", "name": "Approve Quotes", "module": "COMMERCIAL", "description": "Can approve commercial contract quotes and price overrides"},
    {"code": "hardware.manage", "name": "Manage Hardware", "module": "OPERATIONS", "description": "Can view, modify, and assign scanner devices and physical hardware"},
    {"code": "pricing.manage", "name": "Manage Pricing Plans", "module": "COMMERCIAL", "description": "Can build plans, change limits, and adjust subscriptions pricing"},
    {"code": "departments.manage", "name": "Manage Departments", "module": "PLATFORM", "description": "Can create, update, and delete company departments"},
    {"code": "teams.manage", "name": "Manage Teams", "module": "PLATFORM", "description": "Can create, update, and delete department teams"},
    {"code": "roles.manage", "name": "Manage Department Roles", "module": "PLATFORM", "description": "Can build, configure, and assign department roles"},
    {"code": "tickets.reply", "name": "Reply to Tickets", "module": "SUPPORT", "description": "Can post comments and triage support tickets"},
    {"code": "developers.keys", "name": "Manage Developer API Keys", "module": "DEVELOPMENT", "description": "Can create, delete, and view developer service accounts"},
    {"code": "templates.view", "name": "View Templates", "module": "TEMPLATES", "description": "Can view templates library and blueprints"},
    {"code": "templates.manage", "name": "Manage Templates", "module": "TEMPLATES", "description": "Can create and design templates"},
    {"code": "templates.publish", "name": "Publish Templates", "module": "TEMPLATES", "description": "Can publish templates to organization or marketplace"},
    {"code": "templates.install", "name": "Install Templates", "module": "TEMPLATES", "description": "Can install templates to events"},
    {"code": "sites.view", "name": "View Sites", "module": "WEBSITE_BUILDER", "description": "Can view event websites and builder configuration"},
    {"code": "sites.manage", "name": "Manage Sites", "module": "WEBSITE_BUILDER", "description": "Can build, modify, and manage pages and navigation"},
    {"code": "sites.publish", "name": "Publish Sites", "module": "WEBSITE_BUILDER", "description": "Can publish pages and verify custom domains"},
    {"code": "blueprints.view", "name": "View Blueprints", "module": "BLUEPRINTS", "description": "Can view event industry blueprints"},
    {"code": "blueprints.manage", "name": "Manage Blueprints", "module": "BLUEPRINTS", "description": "Can design and configure blueprint steps"},
    {"code": "themes.view", "name": "View Themes", "module": "THEMES", "description": "Can view system and organization themes"},
    {"code": "themes.manage", "name": "Manage Themes", "module": "THEMES", "description": "Can create themes and set token presets"},
    {"code": "marketplace.manage", "name": "Manage Marketplace", "module": "MARKETPLACE", "description": "Can manage marketplace listings and reviews"},
    {"code": "marketplace.publish", "name": "Publish Marketplace", "module": "MARKETPLACE", "description": "Can publish template listings to global marketplace"},
    {"code": "operations.requests.manage", "name": "Manage Service Requests", "module": "OPERATIONS", "description": "Can submit, review, and approve technology service requests"},
    {"code": "operations.projects.manage", "name": "Manage Operations Projects", "module": "OPERATIONS", "description": "Can create, update, and manage operations projects, milestones, and tasks"},
    {"code": "operations.resources.manage", "name": "Manage Operations Resources", "module": "OPERATIONS", "description": "Can allocate staff, assign equipment, and plan travel"},
    {"code": "operations.deployments.manage", "name": "Manage Deployments", "module": "OPERATIONS", "description": "Can track deployments, complete checklists, and manage readiness and risks"}
    ,{"code": "operations.overview.view", "name": "View Operations Overview", "module": "OPERATIONS", "description": "Can view authoritative platform operations status"}
    ,{"code": "operations.jobs.view", "name": "View Operations Jobs", "module": "OPERATIONS", "description": "Can view durable background-job records"}
    ,{"code": "operations.jobs.manage", "name": "Manage Operations Jobs", "module": "OPERATIONS", "description": "Can request supported retries and cooperative cancellation"}
    ,{"code": "operations.infrastructure.view", "name": "View Infrastructure Telemetry", "module": "OPERATIONS", "description": "Can view database, queue, and storage telemetry"}
    ,{"code": "operations.search.manage", "name": "Manage Search Operations", "module": "OPERATIONS", "description": "Can trigger governed tenant reindex jobs"}
    ,{"code": "operations.risks.view", "name": "View Operational Risks", "module": "OPERATIONS", "description": "Can view the operational risk register"}
    ,{"code": "operations.risks.manage", "name": "Manage Operational Risks", "module": "OPERATIONS", "description": "Can manage risks, actions, evidence, and resolution"}
    ,{"code": "operations.venue.view", "name": "View Venue Readiness", "module": "OPERATIONS", "description": "Can view supplier and venue readiness"}
    ,{"code": "operations.venue.manage", "name": "Manage Venue Readiness", "module": "OPERATIONS", "description": "Can manage event supplier accountability and readiness"}
]

