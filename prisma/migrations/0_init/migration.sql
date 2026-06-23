-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('RESEARCHER', 'ADMIN');

-- CreateEnum
CREATE TYPE "PaperStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'SUBMITTED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SectionType" AS ENUM ('ABSTRACT', 'INTRODUCTION', 'METHODS', 'RESULTS', 'DISCUSSION', 'CONCLUSION', 'REFERENCES', 'CUSTOM', 'FULL_DOCUMENT');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('STYLE', 'STRUCTURE', 'LOGIC', 'CITATION', 'TEMPLATE', 'CHAT');

-- CreateEnum
CREATE TYPE "SuggestionType" AS ENUM ('STYLE', 'GRAMMAR', 'STRUCTURE', 'CITATION', 'LOGIC', 'GENERAL');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'MODIFIED');

-- CreateEnum
CREATE TYPE "CitationType" AS ENUM ('JOURNAL', 'CONFERENCE', 'BOOK', 'PREPRINT', 'WEB', 'OTHER');

-- CreateEnum
CREATE TYPE "CitationVerificationStatus" AS ENUM ('VERIFIED', 'PARTIAL', 'UNVERIFIED', 'NOT_FOUND', 'ERROR');

-- CreateEnum
CREATE TYPE "ReviewSeverity" AS ENUM ('CRITICAL', 'MAJOR', 'MINOR', 'SUGGESTION');

-- CreateEnum
CREATE TYPE "ReviewCategory" AS ENUM ('METHODOLOGY', 'CLARITY', 'NOVELTY', 'CITATION', 'LANGUAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "ResponseStatus" AS ENUM ('DRAFT', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AuditActionType" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'ACCEPT_SUGGESTION', 'REJECT_SUGGESTION', 'VERIFY_CITATION', 'CHAT');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "institution" TEXT,
    "native_language" TEXT,
    "research_field" TEXT,
    "profile_settings" JSONB NOT NULL DEFAULT '{}',
    "role" "UserRole" NOT NULL DEFAULT 'RESEARCHER',
    "password_hash" TEXT,
    "google_sub" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signup_verifications" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "institution" TEXT,
    "password_hash" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signup_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "papers" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "title" TEXT NOT NULL DEFAULT 'Untitled',
    "status" "PaperStatus" NOT NULL DEFAULT 'DRAFT',
    "target_journal" TEXT,
    "citation_style" TEXT,
    "language_level" TEXT,
    "raw_latex" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "papers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_sections" (
    "id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "section_type" "SectionType" NOT NULL,
    "order_index" INTEGER NOT NULL,
    "original_content" TEXT NOT NULL DEFAULT '',
    "current_content" TEXT NOT NULL DEFAULT '',
    "word_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paper_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_sessions" (
    "id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "section_id" UUID,
    "user_id" UUID,
    "task_type" "TaskType" NOT NULL,
    "user_input" TEXT NOT NULL DEFAULT '',
    "ai_output" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "tokens_used" INTEGER NOT NULL DEFAULT 0,
    "confidence_score" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suggestions" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "section_id" UUID,
    "suggestion_type" "SuggestionType" NOT NULL DEFAULT 'STYLE',
    "original_text" TEXT NOT NULL,
    "suggested_text" TEXT NOT NULL,
    "section_label" TEXT,
    "explanation" TEXT,
    "diff" TEXT,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "citations" (
    "id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "citation_key" TEXT NOT NULL,
    "citation_type" "CitationType" NOT NULL DEFAULT 'OTHER',
    "authors" TEXT,
    "title" TEXT,
    "journal" TEXT,
    "year" INTEGER,
    "doi" TEXT,
    "eprint" TEXT,
    "raw_text" TEXT,
    "formatted_styles" JSONB NOT NULL DEFAULT '{}',
    "verification_status" "CitationVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "verification_message" TEXT,
    "verification_layers" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "citations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "citation_usages" (
    "id" UUID NOT NULL,
    "citation_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "position_start" INTEGER NOT NULL,
    "position_end" INTEGER NOT NULL,
    "context_snippet" TEXT NOT NULL,

    CONSTRAINT "citation_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviewer_comments" (
    "id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "reviewer_label" TEXT NOT NULL,
    "comment_text" TEXT NOT NULL,
    "severity" "ReviewSeverity" NOT NULL,
    "category" "ReviewCategory" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviewer_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "response_suggestions" (
    "id" UUID NOT NULL,
    "comment_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "suggested_response" TEXT NOT NULL,
    "revision_note" TEXT,
    "status" "ResponseStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "response_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "paper_id" UUID,
    "action_type" "AuditActionType" NOT NULL,
    "before_state" JSONB,
    "after_state" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_sub_key" ON "users"("google_sub");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "signup_verifications_email_idx" ON "signup_verifications"("email");

-- CreateIndex
CREATE INDEX "papers_user_id_idx" ON "papers"("user_id");

-- CreateIndex
CREATE INDEX "paper_sections_paper_id_idx" ON "paper_sections"("paper_id");

-- CreateIndex
CREATE INDEX "ai_sessions_paper_id_idx" ON "ai_sessions"("paper_id");

-- CreateIndex
CREATE INDEX "ai_sessions_section_id_idx" ON "ai_sessions"("section_id");

-- CreateIndex
CREATE INDEX "suggestions_session_id_idx" ON "suggestions"("session_id");

-- CreateIndex
CREATE INDEX "citations_paper_id_idx" ON "citations"("paper_id");

-- CreateIndex
CREATE UNIQUE INDEX "citations_paper_id_citation_key_key" ON "citations"("paper_id", "citation_key");

-- CreateIndex
CREATE INDEX "citation_usages_citation_id_idx" ON "citation_usages"("citation_id");

-- CreateIndex
CREATE INDEX "citation_usages_section_id_idx" ON "citation_usages"("section_id");

-- CreateIndex
CREATE INDEX "reviewer_comments_paper_id_idx" ON "reviewer_comments"("paper_id");

-- CreateIndex
CREATE INDEX "response_suggestions_comment_id_idx" ON "response_suggestions"("comment_id");

-- CreateIndex
CREATE INDEX "audit_logs_paper_id_idx" ON "audit_logs"("paper_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "papers" ADD CONSTRAINT "papers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_sections" ADD CONSTRAINT "paper_sections_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_sessions" ADD CONSTRAINT "ai_sessions_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_sessions" ADD CONSTRAINT "ai_sessions_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "paper_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_sessions" ADD CONSTRAINT "ai_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ai_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "paper_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citations" ADD CONSTRAINT "citations_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citation_usages" ADD CONSTRAINT "citation_usages_citation_id_fkey" FOREIGN KEY ("citation_id") REFERENCES "citations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citation_usages" ADD CONSTRAINT "citation_usages_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "paper_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviewer_comments" ADD CONSTRAINT "reviewer_comments_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "response_suggestions" ADD CONSTRAINT "response_suggestions_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "reviewer_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "response_suggestions" ADD CONSTRAINT "response_suggestions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ai_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
