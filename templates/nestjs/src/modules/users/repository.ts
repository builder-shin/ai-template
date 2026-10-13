import { Injectable } from "@nestjs/common";
import type { Tx } from "../../core/db/unit-of-work.js";
@Injectable()
export class UsersRepository {
  findByEmail(tx: Tx, email: string) {
    return tx.user.findUnique({ where: { email } });
  }
}
