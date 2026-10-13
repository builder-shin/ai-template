import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../core/db/prisma.service.js";
@Injectable()
export class DecoratedService {
  constructor(readonly prisma: PrismaService) {}
}
