-- reference only
CREATE TABLE IF NOT EXISTS automation_template_runs (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL REFERENCES users(id),
  project_id text NOT NULL,
  template_id text NOT NULL,
  mode text NOT NULL,
  status text NOT NULL,
  summary text,
  idempotency_key text,
  target_url text,
  request_json text NOT NULL DEFAULT '{}',
  response_json text NOT NULL DEFAULT '{}',
  error_message text,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  completed_at text
);
