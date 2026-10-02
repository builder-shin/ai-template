"""다른 폴더의 git 실행에 hook의 저장소 선택 환경을 넘기지 않는다."""

import os
from collections.abc import Mapping

REPOSITORY_VARIABLES = frozenset(
    {
        "GIT_DIR",
        "GIT_WORK_TREE",
        "GIT_INDEX_FILE",
        "GIT_COMMON_DIR",
        "GIT_OBJECT_DIRECTORY",
        "GIT_ALTERNATE_OBJECT_DIRECTORIES",
        "GIT_NAMESPACE",
        "GIT_PREFIX",
    }
)


def git_environment(environment: Mapping[str, str] | None = None) -> dict[str, str]:
    """환경을 복사해 저장소 선택 변수만 뺀다. GIT_CONFIG_* 등은 보존한다."""
    source = os.environ if environment is None else environment
    return {key: value for key, value in source.items() if key not in REPOSITORY_VARIABLES}
