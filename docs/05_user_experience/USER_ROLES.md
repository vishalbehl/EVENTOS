# EventX OS User Roles

This document outlines the user roles, their purposes, and associated permissions within the EventX OS ecosystem, derived from the database schema, RBAC seeding logic, and application source code.

---

## 1. System Administration & Organization Roles
*These roles manage the platform's core infrastructure and organizational structure.*

| Role | Purpose | Likely Permissions |
| :--- | :--- | :--- |
| **Super Admin** | Root access to the entire platform. | Full access to all modules (`USERS`, `EVENTS`, `SESSIONS`, `ORGANIZATIONS`, `SYSTEM_SETTINGS`). Can manage other Super Admins. |
| **Event Organizer** | Primary owner of a specific event or set of events. | Manage all event aspects, teams, and configurations. Cannot delete the Organization or global system users. |
| **Admin** | High-level administrative assistant for the organization. | All event operations except high-risk actions like `USERS:DELETE` or global billing settings. |

---

## 2. Scientific Content & Program Roles
*These roles focus on managing the conference agenda, speakers, and presentations.*

| Role | Purpose | Likely Permissions |
| :--- | :--- | :--- |
| **Speaker Manager** | Manages the speaker roster and scientific materials. | `SPEAKERS:VIEW/CREATE/EDIT`, `FILES:APPROVE/REJECT/DOWNLOAD`, `POSTERS:MANAGE`. |
| **Session Manager** | Oversees the scheduling and orchestration of sessions. | `SESSIONS:CREATE/EDIT/VIEW`, `SPEAKERS:VIEW`, `ROOMS:VIEW`. |
| **Speaker** | Individual contributor managing their own content. | Typically scoped via **Upload Tokens** to their own files. Role exists in RBAC for portal-based management. |
| **Moderator** | Facilitates live sessions and Q&A. | `SESSIONS:VIEW`, `QUEUE:VIEW`, `FILES:VIEW`. Scoped to assigned sessions. |

---

## 3. Registration & Attendee Management Roles
*These roles handle the participant lifecycle from ticketing to check-in.*

| Role | Purpose | Likely Permissions |
| :--- | :--- | :--- |
| **Registration Manager** | Full authority over the registration module. | `REGISTRATION:APPROVE/REJECT/WAITLIST`, `REG_CONFIG:EDIT`, `PAYMENTS:MANAGE`, `PARTICIPANTS:IMPORT/EXPORT`. |
| **Registration Coordinator** | Handles daily participant operations and data entry. | `PARTICIPANTS:CREATE/EDIT`, `BADGES:VIEW`, `CAMPAIGNS:CREATE/SEND`, `ANALYTICS:VIEW`. |
| **Registration Reviewer** | Focused on the attendee validation/approval workflow. | `REGISTRATION:VIEW_QUEUE`, `REGISTRATION:APPROVE/REJECT`, `ANALYTICS:REG_DASHBOARD`. |
| **Badge Manager** | Manages physical badge production and print queues. | `BADGES:GENERATE/PRINT/REPRINT`, `BADGES:TEMPLATES`, `PARTICIPANTS:VIEW`. |
| **Check-in Staff** | Front-desk operations for attendee arrival. | `CHECKIN:QR`, `CHECKIN:MANUAL`, `PARTICIPANTS:VIEW`, `BADGES:VIEW`. |
| **Registration Viewer** | Read-only access for data monitoring and reporting. | `PARTICIPANTS:VIEW`, `PAYMENTS:VIEW`, `ANALYTICS:VIEW`. |

---

## 4. Venue & Technical Operations Roles
*These roles ensure smooth technical execution at the physical event site.*

| Role | Purpose | Likely Permissions |
| :--- | :--- | :--- |
| **Technician** | On-site IT support and hardware monitor. | `DEVICES:VIEW/MANAGE`, `QUEUE:VIEW`, `ROOMS:VIEW`, `FILES:VIEW`. |
| **Room Manager** | Oversees operations in a specific hall or room. | Scoped permissions to assigned `ROOM` nodes. `SESSIONS:VIEW`, `FILES:VIEW`. |
| **Venue Operator** | Local playback operations (Presentation Desk). | `SESSIONS:VIEW`, `FILES:DOWNLOAD`, `QUEUE:VIEW`. Restricted to local venue server access. |
| **Volunteer** | Temporary staff for basic assistance. | Highly restricted. Typically `CHECKIN:QR` or `SESSIONS:VIEW`. |

---

## 5. Participant Roles (Attendee Categories)
*These are categories assigned to participants during registration, often used to determine badge layouts and access privileges.*

- **Delegate**: Standard attendee with access to main scientific sessions.
- **VIP**: High-profile attendee with access to restricted lounges or functions.
- **Speaker**: Presenter category (separate from the system "Speaker" role).
- **Faculty**: Academic or organizational committee members.
- **Exhibitor**: Staff representing sponsors or booth vendors (Inferred from common conference patterns).

---

## 6. RBAC & Hierarchy Observations

### Hierarchical Inheritance
The system implements a `ROLE_HIERARCHY` where higher-tier roles implicitly hold the permissions of lower-tier ones.
- **Super Admin** sits at the top.
- **Viewer** sits at the bottom, providing basic `VIEW` permissions across all modules.

### Node-Based Scoping
Permissions can be further restricted by **Access Nodes**. For example:
- A **Room Manager** might have `SESSIONS:VIEW` permissions, but only for `node_id` corresponding to "Hall A".
- A **Speaker**'s token is implicitly scoped to their specific `speaker_id`.

### Inferred Roles (Planned/Scaffolded)
Based on folder names and UI components, the following roles appear planned or partially implemented:
- **Finance Auditor**: To manage `PAYMENTS:REFUND` and global financial reconciliations.
- **Content Reviewer**: Specifically for Digital ePosters (`POSTERS:APPROVE`).
