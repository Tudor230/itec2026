ALTER TABLE "files"
ADD COLUMN "storage_key" TEXT,
ADD COLUMN "content_hash" TEXT NOT NULL DEFAULT '',
ADD COLUMN "byte_size" INTEGER NOT NULL DEFAULT 0;

UPDATE "files"
SET "storage_key" = "project_id" || '/' || "id"
WHERE "storage_key" IS NULL;

ALTER TABLE "files"
ALTER COLUMN "storage_key" SET NOT NULL;

CREATE UNIQUE INDEX "files_storage_key_key" ON "files"("storage_key");

CREATE TABLE "yjs_aggregates" (
    "file_id" TEXT NOT NULL,
    "next_sequence" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "yjs_aggregates_pkey" PRIMARY KEY ("file_id")
);

CREATE TABLE "yjs_updates" (
    "id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "update_base64" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "yjs_updates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "yjs_snapshots" (
    "id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "update_base64" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "yjs_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "yjs_updates_file_id_sequence_key" ON "yjs_updates"("file_id", "sequence");
CREATE INDEX "yjs_updates_file_id_created_at_idx" ON "yjs_updates"("file_id", "created_at");
CREATE INDEX "yjs_snapshots_file_id_sequence_idx" ON "yjs_snapshots"("file_id", "sequence");
CREATE INDEX "yjs_snapshots_file_id_created_at_idx" ON "yjs_snapshots"("file_id", "created_at");

ALTER TABLE "yjs_aggregates"
ADD CONSTRAINT "yjs_aggregates_file_id_fkey"
FOREIGN KEY ("file_id") REFERENCES "files"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "yjs_updates"
ADD CONSTRAINT "yjs_updates_file_id_fkey"
FOREIGN KEY ("file_id") REFERENCES "files"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "yjs_snapshots"
ADD CONSTRAINT "yjs_snapshots_file_id_fkey"
FOREIGN KEY ("file_id") REFERENCES "files"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
