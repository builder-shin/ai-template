/**
 * 시드. FastAPI 템플릿의 seed.py와 같은 데이터를 넣는다. 여러 번 불러도 안전하다(이미 있는 데이터는
 * 건드리지 않는다). 앱을 만들 때(createApp) 부르므로 서버가 포트를 열기 전에 끝난다.
 *
 * - 시스템 역할 admin, member
 * - 관리자 계정: 설정의 SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD. 이메일 인증을 마쳤고 admin 역할만 가진다.
 * - 예제 글: 관리자가 쓴 글 셋(발행 둘, 초안 하나). 관리자에게 글이 하나도 없을 때만 만든다.
 */

import type { MockConfig } from "./config.ts";
import { ensureExamplePosts } from "./modules/posts/examples.ts";
import { ADMIN_ROLE } from "./modules/roles/model.ts";
import { ensureSystemRoles } from "./modules/roles/service.ts";
import { createAccount, findAccount } from "./modules/users/accounts.ts";
import { normalizeEmail } from "./modules/users/model.ts";
import type { MockState } from "./state.ts";

export const ADMIN_NAME = "Admin";

/** 시드를 넣고, 새로 넣은 것을 한 줄씩 설명해 돌려준다. */
export function seed(state: MockState, config: MockConfig): string[] {
  const now = state.clock.now();
  const done = ensureSystemRoles(state.store, now).map((name) => `역할 ${name}`);
  const email = normalizeEmail(config.seedAdmin.email);
  let admin = findAccount(state.store, email);
  if (admin === undefined) {
    const account = {
      email,
      password: config.seedAdmin.password,
      name: ADMIN_NAME,
      locale: "ko" as const,
      verified: true,
      roleNames: [ADMIN_ROLE],
    };
    admin = createAccount(state.store, account, now);
    done.push(`관리자 ${email}`);
  }
  done.push(...ensureExamplePosts(state, admin.id).map((title) => `글 ${title}`));
  return done;
}
