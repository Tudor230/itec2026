CREATE TABLE "yjs_rewinds" (
    "id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "applied_sequence" INTEGER NOT NULL,
    "target_sequence" INTEGER NOT NULL,
    "previous_head_sequence" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "yjs_rewinds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "yjs_rewinds_file_id_applied_sequence_key" ON "yjs_rewinds"("file_id", "applied_sequence");
CREATE INDEX "yjs_rewinds_file_id_created_at_idx" ON "yjs_rewinds"("file_id", "created_at");
CREATE INDEX "yjs_rewinds_file_id_target_sequence_idx" ON "yjs_rewinds"("file_id", "target_sequence");

ALTER TABLE "yjs_rewinds"
ADD CONSTRAINT "yjs_rewinds_file_id_fkey"
FOREIGN KEY ("file_id") REFERENCES "files"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
