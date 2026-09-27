"""auth의 잡. 만료된 토큰과 끝난 세션을 매일 03:00(UTC)에 지운다(scheduler가 보낸다)."""

import structlog

import app.modules.auth.repository as repository
from app.core.db import utc_now
from app.core.jobs import JOB_CONTEXT, Job, JobContext

logger = structlog.get_logger(__name__)


async def purge_credentials(context: JobContext = JOB_CONTEXT) -> None:
    async with context.sessions() as session:
        purged = await repository.purge_expired(session, utc_now())
        await session.commit()
    logger.info("credentials_purged", **purged)


PURGE_CREDENTIALS = Job("auth.purge_credentials", purge_credentials, cron="0 3 * * *")
JOBS = (PURGE_CREDENTIALS,)
