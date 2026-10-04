-- Quota / admin usage sums filter ai_sessions by (user_id, created_at range) on every LLM request.
-- Usage rows always store the paper owner's user_id; backfill legacy rows that relied on the
-- papers.user_id fallback so the query can drop the join and use the index below.

-- Backfill
UPDATE "ai_sessions" AS s
SET "user_id" = p."user_id"
FROM "papers" AS p
WHERE s."paper_id" = p."id"
  AND s."user_id" IS NULL
  AND p."user_id" IS NOT NULL;

-- CreateIndex
CREATE INDEX "ix_ai_sessions_user_id_created_at" ON "ai_sessions"("user_id", "created_at");
