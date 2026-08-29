# Walkthrough: How Search Works in EVENTOS (Step-by-Step Flow)

## 1. The Core Idea: The "Book Index" Analogy

To understand how search works, think of a massive 1,000-page textbook:
* **Without a Search Index (Direct DB Query)**: Every time someone asks "Where is the topic *Cardiology*?", the computer has to flip through all 1,000 pages line by line. If 500 people ask at the same time, the computer gets exhausted and freezes.
* **With a Search Index (EVENTOS Search)**: The computer maintains a cheat sheet at the back of the book (*Index Page*). Next to "Cardiology", it already has the exact page numbers, speaker names, and hall locations. It answers in 0.01 seconds.

---

## 2. Flow 1: How Data Gets Indexed (The Preparation Flow)

When someone adds or edits information in EVENTOS (e.g. uploading a speaker profile or adding a session):

```mermaid
graph TD
    A[1. Organizer adds/updates Speaker or Session] --> B[(Main PostgreSQL Tables)]
    B -->|Event Dispatched| C[2. Search Background Worker]
    C -->|Extracts names, bio, keywords| D[3. Flattener Engine]
    D -->|Saves unified searchable document| E[(search.search_documents Table)]
```

### Step-by-Step:
1. **Data Entry**: An organizer uploads an Excel sheet with 300 speakers, or a speaker edits their bio in the Speaker Portal.
2. **Background Notification**: The main database saves the record and notifies the background worker ([`services/workers/tasks/search_tasks.py`](file:///d:/DEV/conf-platform/services/workers/tasks/search_tasks.py)).
3. **Text Extraction**: The worker extracts all human-readable words:
   - Speaker name: *"Dr. Sarah Jenkins"*
   - Bio/Specialty: *"Pediatric Heart Surgeon, AI in Cardiology"*
   - Session: *"Innovations in Valve Replacement"*
   - Room: *"Grand Ballroom Hall C"*
4. **Flattening into Search Index**: The worker packages all these words into a single pre-indexed search record (`SearchDocument`).

---

## 3. Flow 2: When a User Searches (The Live Query Flow)

When an attendee, speaker, or staff member types in the search bar:

```mermaid
sequenceDiagram
    autonumber
    actor User as Attendee / Staff (Mobile App / Kiosk)
    participant UI as Search Bar Component
    participant API as Search API
    participant Index as Search Index (Pre-flattened Store)
    
    User->>UI: Types "Dr Sarah valve"
    UI->>API: GET /api/v1/search?q=Dr+Sarah+valve
    API->>Index: Searches single indexed document table
    Index-->>API: Instant match found (Ranked by relevance)
    API-->>UI: Returns JSON (Speaker, Session, Time, Hall)
    UI-->>User: Displays instant interactive card
```

### Step-by-Step:
1. **Typing**: The user types any combination of words (e.g., doctor name + topic or room name).
2. **Single-Table Query**: The backend queries only the optimized `search.search_documents` table—no complex joins, no locking of main business tables.
3. **Instant Card Display**: In under 10 milliseconds, the UI displays rich cards (session timing, hall directions, speaker bio, downloadable slides).

---

## 4. Flow 3: Command Center Maintenance (The Full Reindex Flow)

When an administrator clicks **"Start Reindex"** in the Command Center ([`/operations-center/search`](file:///d:/DEV/conf-platform/apps/cloud/command-center/features/operations/routes/operations-center/search/PageScreen.tsx)):

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Super Admin
    participant CC as Command Center UI
    participant Backend as FastAPI Backend
    participant DB as PostgreSQL
    participant Worker as Celery Background Worker
    
    Admin->>CC: Enters reason & clicks "Start Reindex"
    CC->>Backend: POST /api/v1/search/reindex (with Idempotency Key & Reason)
    Backend->>DB: Creates SearchJob record (status: pending)
    Backend->>Worker: Enqueues job in "search" queue
    Backend-->>CC: Returns 202 Accepted (Job ID)
    
    loop Batch Processing
        Worker->>DB: Reads 100 records at a time
        Worker->>DB: Rebuilds search documents & updates records_processed
        CC->>Backend: Polls GET /api/v1/search/jobs
        Backend-->>CC: Updates live progress bar (e.g. 850/1200 records)
    end
    
    Worker->>DB: Marks SearchJob as completed
```

### Why is this flow isolated?
* Because full reindexing processes thousands of records, it runs **completely in the background** on dedicated worker processes. The live conference app and attendees experience **zero slowdowns or interruptions**.
