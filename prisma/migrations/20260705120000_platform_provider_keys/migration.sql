-- Admin-managed LLM provider API keys (encrypted at rest, priority failover)

CREATE TABLE IF NOT EXISTS platform_provider_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    label TEXT,
    key_ciphertext TEXT NOT NULL,
    key_hint TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_verified_at TIMESTAMPTZ,
    last_error TEXT,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_platform_provider_keys_provider_priority UNIQUE (provider, priority)
);

CREATE INDEX IF NOT EXISTS ix_platform_provider_keys_provider
    ON platform_provider_keys (provider);
