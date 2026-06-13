# Phase 2 Walkthrough — Files, Workflows & AI RAG Platform

## Overview
Phase 2 activates the remaining backend skeleton modules for **Files**, **Workflows**, and **AI RAG Platform** domains. It establishes a standardized file upload vault with background virus scanning, an automation step executor, and a semantic retrieval chat agent using Gemini. Premium dashboard interfaces have been added to the Next.js Command Center workspace.

---

## Section 1 — Backend: `files` Module (Asset Management)

### 📄 [`file_schemas.py`](file:///d:/DEV/conf-platform/services/backend/app/modules/files/schemas/file_schemas.py)
Pydantic schemas that model the general file vault APIs:
* `AssetOut`: Main asset response schema with nested versions list, tags, and virus scan reports.
* `AssetVersionOut`: Metadata for a specific uploaded version.
* `VirusScanOut`: Result of the background scan.
* `AddTagsRequest`: Associates tags with an asset.

### 📄 [`file_service.py`](file:///d:/DEV/conf-platform/services/backend/app/modules/files/services/file_service.py)
Encapsulates all files logic:
* `list_assets()`: Tenant-isolated lookup with tags and extension query filters.
* `upload_asset()`: Writes bytes to the assets bucket (S3 or local), inserts the `Asset` and first `AssetVersion` records, and triggers the `scan_file_for_viruses` Celery task.
* `add_tags()` / `remove_tag()`: Tag management.
* `delete_asset()`: Deletes all physical storage files and removes database metadata records.

### 📄 [`routers/files.py`](file:///d:/DEV/conf-platform/services/backend/app/modules/files/routers/files.py)
Exposes tenant-scoped asset vault endpoints:
* `POST /files/upload`: Multipart upload with size and restricted format validation.
* `GET /files`: Retrieve search/filter assets.
* `GET /files/{asset_id}`: Inspect properties.
* `GET /files/{asset_id}/download`: Get download presigned link redirect.
* `POST /files/{asset_id}/tags` / `DELETE /files/{asset_id}/tags/{tag}`: Modify tags.
* `DELETE /files/{asset_id}`: Remove file.

### 📄 [`tasks/file_tasks.py`](file:///d:/DEV/conf-platform/services/workers/tasks/file_tasks.py)
Added the `@app.task scan_file_for_viruses` Celery task:
* Creates a `pending` `VirusScan` record.
* Downloads asset bytes from the storage bucket.
* Performs signature pattern matching (handles EICAR testing files and standard files).
* Updates status to `clean` or `infected`.

---

## Section 2 — Backend: `workflow` Module (Automation Engine)

### 📄 [`workflow_schemas.py`](file:///d:/DEV/conf-platform/services/backend/app/modules/workflow/schemas/workflow_schemas.py)
Pydantic schemas modeling workflows and visual step chains:
* `WorkflowOut`: Core template with steps list.
* `WorkflowInstanceOut`: Status of the execution tracker with history logs and active tasks.

### 📄 [`workflow_service.py`](file:///d:/DEV/conf-platform/services/backend/app/modules/workflow/services/workflow_service.py)
* `trigger_workflow()`: Instantiates a pipeline, creates the initial task, and logs the execution.
* `execute_step()`: Runs dynamic step logic:
  - `email_notification`: Automatically sends email using the template configuration.
  - `badge_approval`: Auto-approves attendee printing badges.
  - `manual_review`: Blocks the pipeline, creates a manual `WorkflowTask`, and assigns it to a user.
  - *Automated steps automatically proceed to the next step once completed successfully.*
* `complete_task()`: Approves a manual blocking step and resumes the pipeline.

### 📄 [`routers/workflows.py`](file:///d:/DEV/conf-platform/services/backend/app/modules/workflow/routers/workflows.py)
Exposes:
* `POST /workflows`: Define template with steps.
* `POST /workflows/{workflow_id}/trigger`: Start execution.
* `GET /workflows/instances/{instance_id}`: Query progress history logs.
* `POST /workflows/tasks/{task_id}/complete`: Complete manual assignments.

---

## Section 3 — Backend: `ai` Module (Gemini RAG Assistant)

### 📄 [`ai_schemas.py`](file:///d:/DEV/conf-platform/services/backend/app/modules/ai/schemas/ai_schemas.py)
* `AiChatRequestIn`: Chat query.
* `AiChatResponseOut`: RAG-augmented chatbot response with citations list.

### 📄 [`ai_service.py`](file:///d:/DEV/conf-platform/services/backend/app/modules/ai/services/ai_service.py)
* `index_organization_entities()`: Computes embeddings (`text-embedding-004`) for events, sessions, and speakers, and writes to the `embeddings` table.
* `semantic_search()`: Embeds query and executes a tenant-scoped cosine similarity vector search over the organization's entities.
* `chat_response()`: Injects search citations into the system instructions, calls the Gemini API (`gemini-2.0-flash`), saves messages, and updates token usage (`ai_usage`) and cost tracking. Includes a pseudo-embedding and mock chatbot model fallback for local offline testing.

### 📄 [`routers/ai.py`](file:///d:/DEV/conf-platform/services/backend/app/modules/ai/routers/ai.py)
* `POST /ai/conversations`: Start conversation.
* `POST /ai/conversations/{conversation_id}/messages`: Chat query.
* `POST /ai/index`: Re-build embeddings index.
* `GET /ai/usage`: Aggregated organization cost and token usage dashboard.

---

## Section 4 — Frontend Dashboards (`apps/cloud/command-center`)

### 📄 [`app/(dashboard)/files/page.tsx`](file:///d:/DEV/conf-platform/apps/cloud/command-center/app/(dashboard)/files/page.tsx)
* **Organization File Vault**: Sleek asset manager. Supports drag-and-drop file uploads, search filtering by tags, visual virus scan shield status badges, and properties drawer.

### 📄 [`app/(dashboard)/events/[eventId]/speaker/workflows/page.tsx`](file:///d:/DEV/conf-platform/apps/cloud/command-center/app/(dashboard)/events/[eventId]/speaker/workflows/page.tsx)
* **Event Automation Tracker**: Renders timeline step boxes with status colors (Completed/Running/Pending/Failed), active review action triggers, and log timeline notes.

### 📄 [`components/ui/AiFloatingAssistant.tsx`](file:///d:/DEV/conf-platform/apps/cloud/command-center/components/ui/AiFloatingAssistant.tsx)
* **Floating AI Chatbot**: Slid-up widget with smooth message transitions, typing indicators, reindexing trigger buttons, and dropdown citation nodes.

### 📄 [`app/(dashboard)/layout.tsx`](file:///d:/DEV/conf-platform/apps/cloud/command-center/app/(dashboard)/layout.tsx)
* Mounted `AiFloatingAssistant` globally.

---

## Section 5 — Verification & Testing

### Automated Test Files
* [`test_phase2_files.py`](file:///d:/DEV/conf-platform/services/backend/tests/test_phase2_files.py): Verifies asset storage uploads, tag additions, file vault retrieval, and deletions.
* [`test_phase2_workflows.py`](file:///d:/DEV/conf-platform/services/backend/tests/test_phase2_workflows.py): Verifies templates setup, triggers execution, automated procedings, and manual task complete events.
* [`test_phase2_ai.py`](file:///d:/DEV/conf-platform/services/backend/tests/test_phase2_ai.py): Verifies semantic indexing, vector cosine searches, message logs, and usage tracking.
