"""auth의 잡.

- 메일(인증, 재설정, 환영): 인자는 사용자 id뿐이다. 잡이 실행될 때 사용자를 읽고, 토큰이 필요하면
  발급해 commit한 뒤 보낸다(auth/service/mails.py). 보내다 실패하면 worker가 재시도한다.
- 정리: 만료된 토큰과 끝난 세션을 매일 03:00(UTC)에 지운다(scheduler가 보낸다).
"""

import uuid

import structlog

import app.modules.auth.repository as repository
import app.modules.auth.service.mails as mails
from app.core.db import utc_now
from app.core.jobs import JOB_CONTEXT, Job, JobContext

logger = structlog.get_logger(__name__)


async def send_verification_mail(user_id: uuid.UUID, context: JobContext = JOB_CONTEXT) -> None:
    await mails.send_verification(context, user_id)


async def send_password_reset_mail(user_id: uuid.UUID, context: JobContext = JOB_CONTEXT) -> None:
    await mails.send_password_reset(context, user_id)


async def send_welcome_mail(user_id: uuid.UUID, context: JobContext = JOB_CONTEXT) -> None:
    await mails.send_welcome(context, user_id)


async def purge_credentials(context: JobContext = JOB_CONTEXT) -> None:
    async with context.sessions() as session:
        purged = await repository.purge_expired(session, utc_now())
        await session.commit()
    logger.info("credentials_purged", **purged)


SEND_VERIFICATION_MAIL = Job("auth.send_verification_mail", send_verification_mail)
SEND_PASSWORD_RESET_MAIL = Job("auth.send_password_reset_mail", send_password_reset_mail)
SEND_WELCOME_MAIL = Job("auth.send_welcome_mail", send_welcome_mail)
PURGE_CREDENTIALS = Job("auth.purge_credentials", purge_credentials, cron="0 3 * * *")
JOBS = (SEND_VERIFICATION_MAIL, SEND_PASSWORD_RESET_MAIL, SEND_WELCOME_MAIL, PURGE_CREDENTIALS)
