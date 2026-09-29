# src/app/modules

도메인 모듈이 있다. 모듈 하나는 `src/app/modules/<이름>/` 폴더 하나다. 파일 구성과 요청 흐름은 `docs/architecture.md`에 있다.

## 규칙

- 모듈 안의 방향은 `router → service → repository → models`다. `schemas`는 router와 service가, `policies`와 `events`는 service가 쓴다. 아래 계층은 위 계층을 import하지 않는다(import-linter 계약 `module-layers`).
- 모듈 안의 다른 계층은 `import app.modules.<모듈>.<계층> as <계층>`(예: `import app.modules.users.repository as repository`)으로 import한다. `from app.modules.<모듈> import <계층>`은 공개 인터페이스(`__init__.py`)를 거쳐 순환 import가 된다(basedpyright `reportImportCycles`).
- 다른 모듈은 `app.modules.<이름>` 패키지만 import한다. 필요한 이름은 그 모듈의 `__init__.py`가 내보낸다(하네스 검사 `module-boundary`).
- 트랜잭션 경계(commit)는 service가 정한다. repository는 commit하지 않는다.
- 보안·관리 행위는 service가 `app.core.audit.record_audit`로 행위와 같은 트랜잭션에서 남긴다. `metadata`에 이메일 같은 개인정보를 넣지 않는다. 식별자를 남겨야 하면 `app.core.security.identifier_hash(값, settings.identifier_hash_secret)`(키가 있는 HMAC)로 해시만 남긴다. `digest`는 무작위 토큰에만 쓴다.
- 문서 모델(`schemas.py`)은 계약의 스키마와 같은 이름을 쓴다. 에러는 `ApiError`와 `ErrorCode`(계약의 목록)만 쓴다.
- 다른 리소스의 `included`에 사용자를 넣을 때는 `users.public_users`(공개 표현: 이름과 아바타, 이메일 없음)를 쓴다.
- 리소스에 파일을 걸 때(아바타, 커버 이미지)는 `files.attachable_file`로 검사한다(요청한 사람 소유의 ready 이미지). 포함 리소스는 `files.file_resources`로 만든다(`meta.downloadUrl`). 소유자가 아닌 사람이 파일을 읽게 하려면 `registry.py`에서 `files.add_read_rule`로 읽기 규칙("이 파일을 가리키는 리소스를 이 사람이 볼 수 있는가")을 건다.
- 파일 id를 드는 열(아바타, 커버 이미지 같은 관계)을 새로 만들면 `registry.py`에 `files.add_reference_check`로 참조 확인을 등록한다. 어느 모듈이든 `files.release`를 부르면(탈퇴 정리 `remove_unreferenced`도 마찬가지) 등록된 확인이 아직 참조한다고 답하지 않는 파일을 지운다. 등록하지 않으면 다른 관계가 바뀔 때 이 파일이 지워진다. 관계를 바꾸거나 지워 파일이 풀리면 flush 뒤 같은 트랜잭션에서 `keys = await files.release(session, [id...])`를 부르고, commit한 뒤 그 키로 `await files.delete_objects(storage, keys)`를 불러 객체를 지운다(posts, users가 하는 대로). 이름과 시그니처는 `app/modules/files/__init__.py`에서 확인한다. `gen:module`이 만든 모듈은 posts의 커버 이미지 자리를 복사해 이미 이렇게 되어 있다.
- 공개 인터페이스(`__init__.py`)는 등록부(`registry.py`)가 모을 `ROUTERS`, `PERMISSIONS`, `JOBS`, `CHANNELS`, `EVENTS`와 다른 모듈이 쓰는 이름만 내보낸다. 모듈을 더하면 `registry.py`에도 더한다.
- 실시간 이벤트는 `events.py`가 선언하고(`EventSpec`, 채널은 `Channel`), service가 쓰기의 commit 전에 `app.core.realtime.queue`로 넣는다. commit이 성공한 뒤에 나간다(`docs/recipes/realtime-event.md`).
- 쓰지 않는 파일은 만들지 않는다. `posts`가 모든 계층을 갖춘 골든 모듈이다. 새 모듈은 `uv run poe gen:module <이름>`으로 posts를 복사해 만들고, 생성기가 알려 주는 고칠 곳을 고친다.
- 골든 모듈의 `# gen:module:` 주석은 생성기의 표시다. `빼기`는 복사하지 않고, `그대로`는 이름을 바꾸지 않고, `고칠 곳`은 새 모듈에서 고칠 자리로 알린다. posts를 고칠 때 표시를 유지한다. 생성기 테스트(`tools/tests/test_genmodule.py`)가 가장 긴 이름(20자)으로 만든 모듈이 줄 길이와 린트를 지키는지 본다.
- 메일 템플릿은 `<모듈>/templates/<ko|en>/<메일>.subject.txt`, `.txt`, `.html`로 두고 로케일마다 세 파일을 모두 둔다(하네스 검사 `mail-template`).
- 테스트는 `<모듈>/tests/`에 둔다. `check --fast`는 바뀐 모듈의 테스트만 돌린다.
- 모델(`models.py`)을 바꾸면 마이그레이션을 만든다(`docs/recipes/migration.md`).
