"""files의 잡. 24시간이 넘도록 pending인 파일을 매시간 정각(UTC)에 지운다(scheduler가 보낸다)."""

import structlog

import app.modules.files.service as service
from app.core.db import utc_now
from app.core.jobs import JOB_CONTEXT, Job, JobContext

logger = structlog.get_logger(__name__)


async def purge_pending(context: JobContext = JOB_CONTEXT) -> None:
    async with context.sessions() as session:
        purged = await service.purge_pending(session, context.storage, utc_now())
    logger.info("pending_files_purged", files=purged)


PURGE_PENDING = Job("files.purge_pending", purge_pending, cron="0 * * * *")
JOBS = (PURGE_PENDING,)
