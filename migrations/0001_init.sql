CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE magic_tokens (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  device_label TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE entries (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'tool',
  status TEXT NOT NULL DEFAULT 'inbox',
  verdict TEXT,
  body TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'web',
  source_url TEXT,
  attributes TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_entries_status ON entries(status);
CREATE INDEX idx_entries_kind ON entries(kind);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'domain',
  UNIQUE(name, kind)
);

CREATE TABLE entry_tags (
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, tag_id)
);

CREATE TABLE entry_relations (
  id TEXT PRIMARY KEY,
  from_entry TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  to_entry TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  verdict TEXT,
  reason TEXT
);
CREATE INDEX idx_relations_from ON entry_relations(from_entry);

CREATE TABLE links (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT,
  kind TEXT,
  note TEXT,
  snapshot TEXT
);
CREATE INDEX idx_links_entry ON links(entry_id);

CREATE TABLE media (
  id TEXT PRIMARY KEY,
  entry_id TEXT REFERENCES entries(id) ON DELETE SET NULL,
  storage_key TEXT NOT NULL,
  mime TEXT,
  width INTEGER,
  height INTEGER,
  caption TEXT
);

CREATE VIRTUAL TABLE entries_fts USING fts5(
  entry_id UNINDEXED,
  title,
  body,
  tags
);
