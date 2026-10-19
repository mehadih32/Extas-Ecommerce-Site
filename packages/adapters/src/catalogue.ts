// PR 500 — the "Keys & connections" catalogue: one declaration per provider the admin page lists, as data. The page
// draws its rows from this list (never from hand-written markup), and the admin API checks every save against it.
//
// - `adapter: true` rows have an adapter in `allAdapters`: the owner can type their keys, the Test button runs, and a
//   passing test moves the connection out of MOCK. Their secret fields must be exactly the adapter's `secrets`
//   (checked by test/catalogue.test.ts).
// - `adapter: false` rows are integrations the blueprint needs whose adapter comes with a later PR (Google Drive
//   backup PR 8/395, Cloudflare PR 602, Telegram PR 9). They show as "not connected" with no button: nothing pretends
//   to work before its code exists.
// - Labels are keys into the admin messages files (apps/web/messages/admin.<lang>.json → `connections.<id>.…`).
// - Adding a provider = one entry here + its labels in both messages files.
import type { Kind, Mode } from './define';

export interface FieldDeclaration {
  /** For a secret: the vault name is `<provider>.<field>`. For config: the key in Integration.config. */
  field: string;
  /** Optional config fields may be left empty. Secrets are always required. */
  optional?: boolean;
}

export interface ConnectionDeclaration {
  /** Stable id, also the label key: `connections.<id>`. */
  id: string;
  kind: Kind;
  /** The adapter's provider key (the vault prefix of its secrets). */
  provider: string;
  /** Whether an adapter exists in code today. */
  adapter: boolean;
  /** Secret fields the owner types (stored in the vault, never shown again). */
  secrets: readonly FieldDeclaration[];
  /** Plain settings of the connection (account name, bucket …), stored on the Integration row. */
  config: readonly FieldDeclaration[];
  /** Only one connection of this kind may be switched on at a time (storage: media go to one place). */
  exclusive: boolean;
  /** The mode a passing test switches the connection to. */
  targetMode: Exclude<Mode, 'MOCK'>;
  /** Needs no key at all (runs from the server's own settings), e.g. local disk. */
  builtIn?: boolean;
}

export const connectionCatalogue: readonly ConnectionDeclaration[] = [
  {
    id: 'azureBlob',
    kind: 'STORAGE',
    provider: 'azureBlob',
    adapter: true,
    secrets: [{ field: 'accountKey' }],
    config: [{ field: 'accountName' }, { field: 'container' }, { field: 'endpoint', optional: true }],
    exclusive: true,
    targetMode: 'LIVE',
  },
  { id: 'googleDrive', kind: 'GOOGLE_DRIVE', provider: 'googleDrive', adapter: false, secrets: [], config: [], exclusive: false, targetMode: 'LIVE' },
  { id: 'googleDriveAddOnly', kind: 'GOOGLE_DRIVE', provider: 'googleDriveAddOnly', adapter: false, secrets: [], config: [], exclusive: false, targetMode: 'LIVE' },
  { id: 'cloudflare', kind: 'CDN', provider: 'cloudflare', adapter: false, secrets: [], config: [], exclusive: false, targetMode: 'LIVE' },
  { id: 'telegram', kind: 'TELEGRAM', provider: 'telegram', adapter: false, secrets: [], config: [], exclusive: false, targetMode: 'LIVE' },
  {
    id: 's3',
    kind: 'STORAGE',
    provider: 's3',
    adapter: true,
    secrets: [{ field: 'accessKeyId' }, { field: 'secretAccessKey' }],
    config: [{ field: 'bucket' }, { field: 'region' }, { field: 'endpoint', optional: true }],
    exclusive: true,
    targetMode: 'LIVE',
  },
  {
    id: 'localDisk',
    kind: 'STORAGE',
    provider: 'localDisk',
    adapter: true,
    secrets: [],
    config: [],
    exclusive: true,
    targetMode: 'LIVE',
    builtIn: true,
  },
];

export function findConnection(id: string): ConnectionDeclaration | undefined {
  return connectionCatalogue.find((c) => c.id === id);
}
