"""모듈 등록. 앱 조립(app.main), broker(app.worker), scheduler가 여기서 모은 것을 쓴다.

모듈을 더하면 그 모듈의 공개 인터페이스(app.modules.<이름>)가 내보낸 것을 여기에 더한다.
- ROUTERS: 모듈의 라우터(`JsonApiRouter`). 앱이 /api/v1 아래에 붙인다.
- PERMISSIONS: 권한. 앱의 권한 레지스트리가 되고, admin 역할은 이 전부를 가진다.
- AUTHENTICATOR: Bearer 토큰을 검증하는 인증기(auth 모듈).
- 모듈 사이의 등록: users가 계정을 닫을 때 부를 처리(auth의 세션 폐기)를 건다.
- JOBS: 잡(`app.core.jobs.Job`). broker가 이름 그대로 등록하고, cron이 있으면 scheduler가 보낸다.
이 파일도 모듈의 공개 인터페이스만 import한다(check의 module-boundary 검사).
"""

from app.core.access import Authenticator
from app.core.jobs import Job
from app.core.jsonapi.operation import JsonApiRouter
from app.core.mail import SEND_MAIL
from app.core.permissions import Permission
from app.modules import audit_logs, auth, posts, roles, users

ROUTERS: tuple[JsonApiRouter, ...] = (*users.ROUTERS, *roles.ROUTERS, *auth.ROUTERS)

PERMISSIONS: tuple[Permission, ...] = (
    *roles.PERMISSIONS,
    *users.PERMISSIONS,
    *audit_logs.PERMISSIONS,
    *posts.PERMISSIONS,
)
JOBS: tuple[Job[...], ...] = (SEND_MAIL, *auth.JOBS)
AUTHENTICATOR: Authenticator = auth.authenticate

# 계정을 닫을 때(비활성화, 탈퇴) auth가 세션을 폐기하고 토큰을 지운다.
users.on_account_closed(auth.close_credentials)
