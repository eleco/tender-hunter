CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tenders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  source_notice_id TEXT NOT NULL UNIQUE,
  source_url TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  buyer_name TEXT NOT NULL,
  country TEXT NOT NULL,
  region TEXT,
  currency TEXT NOT NULL DEFAULT 'EUR',
  estimated_value NUMERIC,
  published_at TIMESTAMPTZ NOT NULL,
  deadline_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'published',
  procedure_type TEXT,
  raw_payload_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tender_cpv_codes (
  tender_id UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  cpv_code TEXT NOT NULL,
  PRIMARY KEY (tender_id, cpv_code)
);

CREATE TABLE IF NOT EXISTS saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  name TEXT NOT NULL,
  countries TEXT[] NOT NULL DEFAULT '{}',
  keywords_include TEXT[] NOT NULL DEFAULT '{}',
  keywords_exclude TEXT[] NOT NULL DEFAULT '{}',
  cpv_include TEXT[] NOT NULL DEFAULT '{}',
  min_value NUMERIC NOT NULL DEFAULT 0,
  max_days_to_deadline INTEGER NOT NULL DEFAULT 45,
  min_score INTEGER NOT NULL DEFAULT 45,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenders_published_at ON tenders (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenders_country ON tenders (country);
CREATE INDEX IF NOT EXISTS idx_tenders_status ON tenders (status);
CREATE INDEX IF NOT EXISTS idx_saved_searches_user_email ON saved_searches (user_email);
