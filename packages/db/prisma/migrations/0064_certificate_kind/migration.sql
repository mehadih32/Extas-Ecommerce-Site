-- PR 397 (S19, CN-031): the Cloudflare Origin certificate in Keys & connections has its own connection kind, so it
-- never stands in for the CDN connection (cache purge) when the shop asks for "the CDN". Only adds a value.
ALTER TYPE "IntegrationKind" ADD VALUE IF NOT EXISTS 'CERTIFICATE';
