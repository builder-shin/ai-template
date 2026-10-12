import { Module } from "@nestjs/common";
import { Storage } from "../../core/storage/client.js";
import { FilesRepository } from "./repository.js";
import { FilesService } from "./service.js";
import { FilesController } from "./controller.js";
@Module({
  providers: [Storage, FilesRepository, FilesService],
  controllers: [FilesController],
  exports: [FilesService, Storage],
})
export class FilesModule {}
