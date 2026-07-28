# Module 0 - Topic 0.2: OS Concurrency, Processes, Threads, GIL & Async I/O

## 1. Introduction & Learning Objectives
In **Topic 0.2**, you will explore operating system concurrency models, process vs thread execution, Python's Global Interpreter Lock (GIL), and non-blocking asynchronous I/O.

### Learning Outcomes:
- Differentiate between CPU-bound and I/O-bound tasks.
- Understand OS process memory isolation vs shared thread memory.
- Explain Python's GIL and how `asyncio` achieves cooperative multitasking.
- Write shell scripts for multi-process local orchestration.

---

## 2. Process vs Thread vs Event Loop Concurrency

### 2.1 Concurrency Paradigms Matrix

| Paradigm | Memory Sharing | Overhead | Best For | Used in EventOS |
| :--- | :--- | :--- | :--- | :--- |
| **Multi-Process** | Isolated address space | High (Process creation) | CPU-bound computation | Celery workers & FFmpeg transcoding |
| **Multithreading** | Shared heap memory | Medium | Blocking I/O (Legacy) | Background file write workers |
| **Async Event Loop** | Single-threaded memory | Very Low | Network I/O (Database, HTTP) | FastAPI API server & Socket.IO |

```
┌────────────────────────────────────────────────────────┐
│               Async Event Loop (Single Thread)         │
│  Task A (I/O Wait) ──> Yield ──> Task B (Execute)      │
└────────────────────────────────────────────────────────┘
```

---

## 3. Python's GIL & Cooperative Multitasking

### 3.1 Python Global Interpreter Lock (GIL)
Python's CPython interpreter uses a mutex (the GIL) to prevent multiple physical CPU cores from executing Python bytecode simultaneously within a single process.
- **CPU-bound tasks** (e.g., PDF parsing, video transcoding) block the GIL and must be executed in separate processes (`multiprocessing` / Celery).
- **I/O-bound tasks** (e.g., querying PostgreSQL, awaiting HTTP requests) release the GIL while waiting, making `asyncio` highly efficient.

### 3.2 Asyncio Mechanics
In FastAPI ([services/backend/app/main.py](file:///d:/DEV/conf-platform/services/backend/app/main.py)), async route handlers execute inside an event loop:
```python
@app.get("/api/v1/events/{event_id}")
async def get_event(event_id: str, db: AsyncSession = Depends(get_db)):
    # Non-blocking async database query
    result = await db.execute(select(Event).where(Event.id == event_id))
    return result.scalar_one_or_none()
```
When `await db.execute(...)` is encountered, control yields back to the event loop, allowing it to process other incoming HTTP requests concurrently.

---

## 4. Local Shell Orchestration Scripts

In EventOS, multi-process local orchestration is handled by PowerShell/Shell scripts ([devrun.ps1](file:///d:/DEV/conf-platform/devrun.ps1)):
```powershell
# Kills hanging processes and launches API, Celery, and Portals in parallel
Stop-Process -Name "python", "node" -ErrorAction SilentlyContinue
Start-Process powershell -ArgumentList "cd services/backend; python -m uvicorn app.main:app --port 8000"
Start-Process powershell -ArgumentList "cd services/backend; python -m celery -A app.worker worker"
```

---

## 5. Practical Exercise & Self-Assessment

### Exercise:
1. Write a Python script comparing runtime performance of fetching 20 HTTP URLs using `requests` (synchronous) vs `httpx` + `asyncio.gather` (asynchronous).
2. Observe how async I/O achieves 10x-50x speedups for network-bound workloads.

---

## 6. Chapter Summary & Next Steps
You now understand OS process management, memory paradigms, Python's GIL, and async event loops. Next, move to **[Module 1 - Topic 1.1: Advanced TypeScript Masterclass](../module-1-monorepo-and-runtimes/topic-1.1-advanced-typescript.md)**.
