import { user } from "../users/index.js";
import type { PrismaService } from "../../core/db/prisma.service.js";
export class PostsService {
  constructor(readonly prisma: PrismaService) {}
  readonly author = user;
}
