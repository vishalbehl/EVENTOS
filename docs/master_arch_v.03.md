# EVENTX OS MASTER ARCHITECTURE CONTEXT (MANDATORY FOR ALL FUTURE DEVELOPMENT)

You are working on EventX OS.

Before making any changes, understand that EventX is no longer a simple conference management application.

It is now a Multi-Tenant Event Operations SaaS Platform that includes:

* Conference Management
* Speaker Management
* Registration Management
* Presentation Management
* Venue Operations
* Developer Platform
* Marketplace Platform
* Application Platform
* AI Platform
* Future Mobile Ecosystem

All future development must align with this architecture.

---

# PLATFORM ARCHITECTURE

EventX follows a strict Domain Driven Design (DDD) architecture.

The platform is organized into the following bounded contexts:

Core Platform Domains

platform
identity
rbac
billing

Business Domains

events
speakers
registration
presentations
venue

Platform Services

communications
analytics
audit

Platform Expansion Domains

applications
marketplace
developer
integrations

Future Domains

workflow
files
jobs
search
mobile
ai
crm
support
sponsors

---

# MULTI-TENANT ARCHITECTURE

EventX is a strict Multi-Tenant SaaS.

Hierarchy:

Platform
↓
Organization (Tenant)
↓
Event
↓
Sessions
↓
Speakers
↓
Presentations
↓
Venue Operations

Rules:

1. Every tenant-owned entity must belong to an Organization.

2. Tenant isolation is mandatory.

3. No cross-organization data leakage is allowed.

4. Every query must be tenant scoped.

5. Every API must validate tenant ownership.

6. RBAC must be evaluated after tenant validation.

7. Super Admin is the only actor allowed to cross tenant boundaries.

---

# ORGANIZATION MODEL

Organizations are first-class SaaS tenants.

Organization owns:

Users
Events
Speakers
Participants
Files
Devices
Subscriptions
Applications
Integrations

Organizations can have:

Custom Domains

Custom Branding

Feature Overrides

Applications Enabled

Marketplace Apps Installed

Subscription Plans

Usage Limits

---

# SUPER ADMIN MODEL

Super Admin is the platform operator.

Super Admin can:

View All Organizations

View All Events

View All Users

Manage Plans

Manage Billing

Manage Marketplace

Manage Applications

Manage Integrations

Manage Feature Flags

Impersonate Users

Override Tenant Limits

View Platform Analytics

Manage Developer APIs

Manage Global Announcements

Manage Platform Health

Super Admin bypasses tenant restrictions.

All Super Admin actions must be audited.

---

# ORGANIZER MODEL

Organizer is the owner of an Organization.

Organizer can:

Manage Organization

Manage Events

Manage Team Members

Manage Speakers

Manage Registration

Manage Presentations

Manage Venue Operations

Manage Branding

Manage Applications

Manage Integrations

View Analytics

Manage Subscription

Organizers cannot access another Organization.

---

# APPLICATION PLATFORM MODEL

Applications are first-class platform entities.

Examples:

Organizer Portal

Registration Portal

Speaker Portal

Venue Operations Portal

Technician Portal

Mobile App

AI Assistant

Admin Console

Applications are stored in:

applications.apps

Organizations enable applications through:

applications.organization_apps

Applications contain features.

Features are mapped to plans.

Plans determine access.

---

# ENTITLEMENT MODEL

Access Control Flow:

Subscription Plan
↓
Applications
↓
Features
↓
Permissions
↓
User Access

Every page, API, and feature must validate:

1. Tenant Ownership
2. Active Subscription
3. Enabled Application
4. Enabled Feature
5. User Permission

Implement a centralized:

FeatureGuard

ApplicationGuard

PlanGuard

middleware/service layer.

Never implement plan checks directly inside routes.

---

# PRICING MODEL

Starter

Small Events

Limited Registrations

Limited Speakers

Core Event Management

Core Registration

Core Speaker Portal

Professional

Everything in Starter

Venue Operations

SRR

Device Management

Advanced Analytics

Advanced Workflows

Enterprise

Everything

API Access

SSO

White Label

Marketplace

Advanced Security

Custom Integrations

Dedicated Infrastructure Options

---

# APPLICATION ENABLEMENT MODEL

Applications can be:

Enabled

Disabled

Trial

Beta

Internal

Marketplace Installed

The sidebar, menus, routes, dashboards, widgets, and APIs must dynamically respect enabled applications.

No hardcoded application visibility.

---

# FILE ARCHITECTURE

All future file handling must use:

files domain

Centralized storage

Versioning

Virus scanning

Asset tagging

Asset permissions

Future uploads must not bypass this architecture.

---

# JOB ARCHITECTURE

All long-running work must use:

jobs domain

Examples:

Email Campaigns

Badge Generation

Imports

Exports

Venue Sync

AI Processing

Search Indexing

File Processing

No heavy synchronous processing.

---

# WORKFLOW ENGINE

All future automation must use:

workflow domain

Examples:

Speaker Upload Workflow

Registration Approval Workflow

Poster Approval Workflow

Notification Workflow

Badge Workflow

Automation must be configurable and not hardcoded.

---

# SEARCH PLATFORM

All global search functionality must use:

search domain

Search should eventually index:

Events

Speakers

Participants

Files

Organizations

Sponsors

Marketplace Apps

---

# DEVELOPER PLATFORM

Developer APIs are a first-class product.

Use:

developer.api_keys

developer.oauth_clients

developer.rate_limits

developer.api_usage

developer.api_audit_logs

All public APIs must be:

Tenant Scoped

Rate Limited

Audited

Permission Controlled

---

# MARKETPLACE PLATFORM

Marketplace is a future revenue stream.

Marketplace apps are installed per Organization.

Marketplace apps must:

Request Permissions

Request Features

Declare Integrations

Respect Tenant Isolation

---

# MOBILE PLATFORM

Future mobile applications must support:

Offline Sync

Push Notifications

Device Registration

Conflict Resolution

Background Synchronization

Mobile functionality must use the mobile domain.

---

# AI PLATFORM

AI functionality must use:

ai domain

Future AI features:

AI Assistant

RAG Search

Speaker Recommendations

Registration Insights

Venue Insights

Cost Tracking

Prompt Versioning

Conversation History

---

# DEVELOPMENT RULES

When implementing new functionality:

1. Determine the owning domain.

2. Verify tenant ownership.

3. Verify application ownership.

4. Verify feature entitlement.

5. Verify permissions.

6. Audit sensitive actions.

7. Respect soft deletes.

8. Use background jobs where appropriate.

9. Never duplicate business logic.

10. Follow DDD boundaries.

Do not introduce shortcuts that violate this architecture.

This architecture is the source of truth for all future EventX development.
