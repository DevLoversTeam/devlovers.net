CREATE TABLE
IF NOT EXISTS email_verification_tokens
(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid
(),
  email text NOT NULL,
  token text NOT NULL,
  expires_at timestamp NOT NULL,
  created_at timestamp DEFAULT now
() NOT NULL
);

CREATE UNIQUE INDEX
IF NOT EXISTS email_verification_tokens_token_idx
  ON email_verification_tokens
(token);