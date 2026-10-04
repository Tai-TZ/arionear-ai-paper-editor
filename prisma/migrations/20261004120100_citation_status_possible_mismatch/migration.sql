-- The citation verifier reports "possible_mismatch" (identifier found, title differs); without this
-- value it was persisted as UNVERIFIED. Kept alone in its migration: a value added by ALTER TYPE
-- cannot be used in the same transaction.

-- AlterEnum
ALTER TYPE "CitationVerificationStatus" ADD VALUE IF NOT EXISTS 'POSSIBLE_MISMATCH';
