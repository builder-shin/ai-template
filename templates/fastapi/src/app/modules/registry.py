"""모듈 등록. 앱 조립(app.main), broker(app.worker), scheduler가 여기서 모은 것을 쓴다.

모듈을 더하면 그 모듈의 공개 인터페이스(app.modules.<이름>)가 내보낸 것을 여기에 더한다.
- ROUTERS: 모듈의 라우터(`JsonApiRouter`). 앱이 /api/v1 아래에 붙인다.
- PERMISSIONS: 권한. 앱의 권한 레지스트리가 되고, admin 역할은 이 전부를 가진다.
- AUTHENTICATOR: Bearer 토큰을 검증하는 인증기(auth 모듈).
- 모듈 사이의 등록: users가 계정을 닫을 때 부를 처리(auth의 세션 폐기)와, files가 파일을 읽게
  해 줄 규칙(사용자의 아바타는 공개)과 파일을 가리키는지 확인하는 처리(탈퇴 때 남길 파일)를 건다.
- JOBS: 잡(`app.core.jobs.Job`). broker가 이름 그대로 등록하고, cron이 있으면 scheduler가 보낸다.
- CHANNELS, EVENTS, MESSAGES: 실시간 구독 채널, 보내는 이벤트, 클라이언트 메시지의 선언
  (app.core.realtime). attach_realtime이 소켓 서버에 연결·구독 처리(realtime 모듈)를 걸 때 채널을
  넘기고, 앱이 openapi.json에 계약의 실시간 확장으로 낸다.
이 파일도 모듈의 공개 인터페이스만 import한다(check의 module-boundary 검사).
"""

import socketio
from starlette.datastructures import State

from app.core.access import Authenticator
from app.core.jobs import Job
from app.core.jsonapi.operation import JsonApiRouter
from app.core.mail import SEND_MAIL
from app.core.permissions import Permission
from app.core.realtime import Channel, EventSpec, MessageSpec
from app.modules import audit_logs, auth, files, posts, realtime, roles, users

ROUTERS: tuple[JsonApiRouter, ...] = (
    *posts.ROUTERS,
    *users.ROUTERS,
    *roles.ROUTERS,
    *auth.ROUTERS,
    *audit_logs.ROUTERS,
    *files.ROUTERS,
    *realtime.ROUTERS,
)

PERMISSIONS: tuple[Permission, ...] = (
    *roles.PERMISSIONS,
    *users.PERMISSIONS,
    *audit_logs.PERMISSIONS,
    *posts.PERMISSIONS,
)
JOBS: tuple[Job[...], ...] = (SEND_MAIL, *auth.JOBS, *files.JOBS)
AUTHENTICATOR: Authenticator = auth.authenticate
CHANNELS: tuple[Channel, ...] = (*posts.CHANNELS,)
EVENTS: tuple[EventSpec, ...] = (*posts.EVENTS,)
MESSAGES: tuple[MessageSpec, ...] = realtime.MESSAGES


def attach_realtime(server: socketio.AsyncServer, state: State) -> None:
    """소켓 서버에 연결·구독 처리를 건다.

    앱이 시작할 때(app.main)와 테스트의 app fixture가 부른다.
    """
    realtime.attach(server, state, CHANNELS)


# 계정을 닫을 때(비활성화, 탈퇴) auth가 세션을 폐기하고 토큰을 지운다.
users.on_account_closed(auth.close_credentials)
# 소유자가 아닌 사람도 읽는 파일: 사용자의 아바타(공개 표현에 들어간다).
files.add_read_rule(users.avatar_readable)
# 볼 수 있는 글의 커버 이미지.
files.add_read_rule(posts.cover_image_readable)
# 탈퇴한 사용자의 파일 중 남는 것: 다른 리소스가 가리키는 파일.
files.add_reference_check(users.avatar_references)
files.add_reference_check(posts.cover_image_references)
