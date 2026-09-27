"""모듈 등록. 앱 조립(app.main), broker(app.worker), scheduler가 여기서 모은 것을 쓴다.

모듈을 더하면 그 모듈의 공개 인터페이스(app.modules.<이름>)가 내보낸 것을 여기에 더한다.
- JOBS: 잡(`app.core.jobs.Job`). broker가 이름 그대로 등록하고, cron이 있으면 scheduler가 보낸다.
이 파일도 모듈의 공개 인터페이스만 import한다(check의 module-boundary 검사).
"""

from app.core.jobs import Job
from app.core.mail import SEND_MAIL

JOBS: tuple[Job[...], ...] = (SEND_MAIL,)
