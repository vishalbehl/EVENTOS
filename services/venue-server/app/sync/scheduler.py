import asyncio
from loguru import logger
from app.sync.schedule_pull import pull_event_queue
from app.sync.outbox_processor import process_outbox
from app.config import settings

class SyncScheduler:
    def __init__(self, event_id: str, pull_interval_seconds: int = 300, outbox_interval_seconds: int = 15):
        self.event_id = event_id
        self.pull_interval_seconds = pull_interval_seconds
        self.outbox_interval_seconds = outbox_interval_seconds
        self._pull_task = None
        self._outbox_task = None

    async def _poll_cloud(self):
        logger.info(f"[Scheduler] Started background pull sync for event {self.event_id} every {self.pull_interval_seconds}s")
        while True:
            try:
                await pull_event_queue(self.event_id)
            except Exception as e:
                logger.error(f"[Scheduler] Error during scheduled pull sync: {e}")
            
            await asyncio.sleep(self.pull_interval_seconds)

    async def _push_outbox(self):
        logger.info(f"[Scheduler] Started background outbox processor for event {self.event_id} every {self.outbox_interval_seconds}s")
        while True:
            try:
                await process_outbox(self.event_id)
            except Exception as e:
                logger.error(f"[Scheduler] Error during outbox processing: {e}")
            
            await asyncio.sleep(self.outbox_interval_seconds)

    def start(self):
        if not self._pull_task:
            self._pull_task = asyncio.create_task(self._poll_cloud())
        if not self._outbox_task:
            self._outbox_task = asyncio.create_task(self._push_outbox())

    def stop(self):
        if self._pull_task:
            self._pull_task.cancel()
            self._pull_task = None
        if self._outbox_task:
            self._outbox_task.cancel()
            self._outbox_task = None
        logger.info("[Scheduler] Stopped all background sync tasks")


# In a multi-event server, we'd manage multiple schedulers.
# For the venue server, it usually only cares about the single event running at that venue.
# We will initialize this scheduler dynamically based on a config or startup param.
