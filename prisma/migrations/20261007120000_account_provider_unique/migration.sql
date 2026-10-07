-- One row per (provider, provider account id). Social sign-in must never
-- create a second local account for the same Google / Facebook identity.
CREATE UNIQUE INDEX "account_providerId_accountId_key" ON "account"("providerId", "accountId");
