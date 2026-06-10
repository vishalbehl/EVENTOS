# EventX OS User Journeys

This document provides sequence diagrams for the primary user journeys and business processes within the EventX OS ecosystem.

---

## 1. Organization Onboarding
```mermaid
sequenceDiagram
    participant User as New Organizer
    participant CC as Command Center
    participant API as Platform API
    participant DB as PostgreSQL
    
    User->>CC: Submit Signup Form
    CC->>API: POST /auth/signup
    API->>DB: Create Organization (Tenant)
    API->>DB: Create Super Admin User
    API->>API: Seed Default Roles & Permissions
    API->>API: Generate Welcome Email
    API-->>CC: HTTP 201 (Created)
    CC-->>User: Redirect to Dashboard
```

## 2. Event Creation
```mermaid
sequenceDiagram
    participant Admin as Event Organizer
    participant CC as Command Center
    participant API as Platform API
    participant DB as PostgreSQL
    
    Admin->>CC: Configure New Event
    CC->>API: POST /api/v1/events
    API->>DB: Create Event Record
    API->>DB: Initialize Default Theme Settings
    API->>DB: Seed Registration Form Schema
    API-->>CC: Event Created
    CC-->>Admin: Show Event Dashboard
```

## 3. Speaker Invitation
```mermaid
sequenceDiagram
    participant Admin as Speaker Manager
    participant CC as Command Center
    participant API as Platform API
    participant Email as Email Service (Resend)
    participant Spk as Speaker
    
    Admin->>CC: Import/Add Speaker
    CC->>API: POST /api/v1/speakers
    API->>API: Generate Unique Upload Token
    API->>Email: Trigger Invitation Template
    Email->>Spk: Send Email with Portal Link
    Spk->>Spk: Clicks tokenized URL
```

## 4. Speaker Upload (Direct-to-Cloud)
```mermaid
sequenceDiagram
    participant Spk as Speaker Portal
    participant API as Platform API
    participant R2 as Object Storage (R2)
    
    Spk->>API: GET /upload-url {filename, size}
    API-->>Spk: Pre-signed S3 v4 URL
    Spk->>R2: HTTP PUT (Direct Binary Transfer)
    R2-->>Spk: 200 OK
    Spk->>API: POST /confirm-upload {file_id}
    API->>API: Trigger Background Validation
```

## 5. SRR Validation (Scientific Review)
```mermaid
sequenceDiagram
    participant API as Platform API
    participant WK as Celery Worker
    participant R2 as Object Storage (R2)
    
    API->>WK: Dispatch validate_presentation_file
    WK->>R2: Download Bytes
    WK->>WK: Run Malware Scan
    WK->>WK: Run PPTX/PDF Technical Check
    WK->>R2: Upload WEBP Thumbnail
    WK->>R2: Upload PDF Preview
    WK->>API: Update File status: pending_approval
```

## 6. Venue Synchronization (Edge Sync)
```mermaid
sequenceDiagram
    participant Admin as Organizer
    participant API as Platform API
    participant WK as Celery Worker
    participant VS as Venue Server (Edge)
    
    Admin->>API: POST /files/{id}/approve
    API->>WK: Trigger sync_approved_file_to_venues
    WK->>VS: POST /internal/sync/receive-file (Stream Bytes)
    VS->>VS: Save to Local MinIO & Local DB
    API->>VS: Webhook: /queue-updated
    VS->>API: GET /sync/pull-schedule (Metadata Refresh)
```

## 7. Room Playback (Live Session)
```mermaid
sequenceDiagram
    participant Tech as Technician Dashboard
    participant VS as Venue Server
    participant RA as Room App (Electron)
    
    Tech->>VS: POST /api/v1/sessions/{id}/lock
    VS->>RA: WebSocket: "Snapshot Ready"
    RA->>VS: GET /api/v1/sessions/{id}/snapshot
    VS-->>RA: Return Frozen Metadata & Cache Paths
    RA->>VS: Download Files from Local MinIO
    RA->>RA: Launch Presentation View
```

## 8. Participant Registration
```mermaid
sequenceDiagram
    participant User as Attendee
    participant Port as Reg Portal
    participant API as Platform API
    participant GW as Payment Gateway (Stripe)
    
    User->>Port: Select Ticket & Submit Form
    Port->>API: POST /register
    API->>API: Create Pending Registration
    API->>GW: Create Checkout Session
    API-->>Port: Return Checkout URL
    User->>GW: Complete Payment
    GW->>API: Webhook: payment_intent.succeeded
    API->>API: Activate Participant & Generate Badge
```

## 9. Badge Printing
```mermaid
sequenceDiagram
    participant Staff as Registration Staff
    participant VR as Venue Registration App
    participant VS as Venue Server
    participant PR as Local Label Printer
    
    Staff->>VR: Search & Select Participant
    VR->>VS: POST /api/v1/venue/badges/{id}/print
    VS->>VS: Render PDF from Template
    VS->>VS: Queue Local Print Job
    VS-->>PR: Raw Print Command (USB/Network)
```

## 10. Check-in (Offline Capable)
```mermaid
sequenceDiagram
    participant User as Attendee
    participant KI as Kiosk/Scanner
    participant VS as Venue Server
    participant API as Cloud API
    
    User->>KI: Scan QR Code
    KI->>VS: POST /api/v1/venue/attendance/checkin
    VS->>VS: Log to Local DB & SyncOutbox
    VS-->>KI: Success: "Welcome!"
    Note right of VS: Network Restored
    VS->>API: POST /sync/push-logs (Outbox Drain)
```

## 11. ePoster Publication
```mermaid
sequenceDiagram
    participant Spk as Speaker Portal
    participant API as Platform API
    participant Admin as Organizer
    participant Disp as Signage Display
    
    Spk->>API: POST /posters/upload
    API->>Admin: Notification: "New Poster for Review"
    Admin->>API: POST /posters/{id}/approve
    Disp->>API: GET /posters/active (Fetch Roster)
    Disp->>Disp: Loop through high-res poster images
```
