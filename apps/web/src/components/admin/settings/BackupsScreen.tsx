"use client";
// S19 · PR 395 (CN-030) — the one-click Google Drive card of Settings → System → Backups: (1) the owner's own Google
// client ("TVs and Limited Input devices": client ID and secret, the secret only into the vault), (2) "Connect Google
// Drive" → the code for google.com/device, Copy, Open, and the page asks every `interval` seconds until Allow; then the
// account, the folder, how many checked copies Drive keeps, the free space and the backups in Drive. Disconnecting,
// connecting again over a live connection and changing the client need the owner's PIN. A person with `system.read`
// only sees it; the buttons need `vault.write` (the API checks again). Every word is from messages/admin-backups.*.json.
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { call, errorText, type Answer } from "@/components/admin/api";
import { dateTime } from "@/components/admin/stock/text";
import { t, type Dict } from "@/lib/i18n";
import { ShellIcon } from "../shell/ShellIcon";

export interface DriveState {
  client: { clientId: string; secretSet: boolean } | null;
  connected: boolean;
  account: string | null;
  folderName: string | null;
  pending: {
    userCode: string;
    verificationUrl: string;
    expiresAt: string;
    interval: number;
  } | null;
  lastTest: { at: string; ok: boolean; message: string | null } | null;
}

interface DriveRow {
  id: string;
  name: string;
  files: number;
  bytes: number;
  checked: boolean;
}

const API = "/api/admin/backups";

const local = (
  d: Dict,
  key: string,
  vars: Record<string, string | number> = {},
) => t(d, `backups.${key}`, vars);

function problem(d: Dict, a: Answer): string {
  return errorText((d.backups ?? {}) as Dict, a, {
    message: String(a.data.message ?? ""),
  });
}

/** Bytes as B, KB, MB or GB, with the screen's own words. */
export function sizeText(d: Dict, n: number, locale: string): string {
  const units = ["b", "kb", "mb", "gb"] as const;
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const shown = new Intl.NumberFormat(locale, {
    maximumFractionDigits: i ? 1 : 0,
  }).format(v);
  return local(d, `size.${units[i]}`, { n: shown });
}

function Note({
  ok,
  text,
  testId,
}: {
  ok: boolean;
  text: string;
  testId: string;
}) {
  return (
    <div
      className={`a2-note${ok ? "" : " bad"} a2-mt12`}
      role={ok ? "status" : "alert"}
      data-testid={testId}
    >
      <ShellIcon name={ok ? "check" : "alert"} size={15} />
      <span>{text}</span>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  value,
  onChange,
  secret,
  disabled,
  testId,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange(v: string): void;
  secret?: boolean;
  disabled?: boolean;
  testId: string;
}) {
  return (
    <div className="a2-fld">
      <label className="a2-lbl" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="a2-inp"
        type={secret ? "password" : "text"}
        inputMode={secret && id.endsWith("pin") ? "numeric" : undefined}
        autoComplete="off"
        spellCheck={false}
        maxLength={200}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
      />
      {hint ? <span className="a2-def a2-blk">{hint}</span> : null}
    </div>
  );
}

/** The Drive card: the client, the connect, the connection and its backups. */
export function DriveCard({
  d,
  locale,
  timeZone,
  initial,
  keepCopies,
  canWrite,
}: {
  d: Dict;
  locale: string;
  timeZone: string;
  initial: DriveState;
  keepCopies: number;
  canWrite: boolean;
}) {
  const router = useRouter();
  const uid = useId();
  const [drive, setDrive] = useState<DriveState>(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [pin, setPin] = useState("");
  /** Which PIN-guarded action is open: changing the client, connecting again, disconnecting. */
  const [ask, setAsk] = useState<null | "client" | "reconnect" | "disconnect">(
    null,
  );
  const [copied, setCopied] = useState(false);
  const [list, setList] = useState<{
    rows: DriveRow[];
    free: number | null;
    total: number | null;
  } | null>(null);
  const [listBusy, setListBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const when = (iso: string) => dateTime(iso, locale, timeZone);

  const poll = useCallback(async () => {
    const a = await call("POST", `${API}/drive/poll`, {});
    if (a.status !== 200 || !a.data.ok) {
      setDrive((x) => ({ ...x, pending: null }));
      setNote({ ok: false, text: problem(d, a) });
      return;
    }
    const status = String(a.data.status);
    if (status === "waiting" || status === "slower") {
      setDrive((x) =>
        x.pending
          ? {
              ...x,
              pending: {
                ...x.pending,
                interval: x.pending.interval + (status === "slower" ? 5 : 0),
              },
            }
          : x,
      );
      return;
    }
    setDrive((x) => ({ ...x, pending: null }));
    if (status === "connected") {
      setNote({
        ok: true,
        text: local(d, "drive.connectedNow", {
          folder: String(a.data.folderName ?? ""),
        }),
      });
      router.refresh();
      setDrive((x) => ({
        ...x,
        connected: true,
        account: (a.data.account as string | null) ?? null,
        folderName: String(a.data.folderName ?? ""),
      }));
      return;
    }
    setNote({
      ok: false,
      text: local(
        d,
        `drive.${status === "denied" || status === "expired" ? status : "none"}`,
      ),
    });
  }, [d, router]);

  // While a code waits for Allow, ask Google (through the shop) every `interval` seconds.
  const pending = drive.pending;
  useEffect(() => {
    if (!pending || !canWrite) return;
    timer.current = setTimeout(
      () => void poll(),
      Math.max(1, pending.interval) * 1000,
    );
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [pending, poll, canWrite]);

  const run = async (path: string, body: Record<string, unknown>) => {
    setBusy(true);
    setNote(null);
    const a = await call("POST", `${API}/${path}`, body);
    setBusy(false);
    return a;
  };

  const saveClient = async () => {
    const a = await run("drive/client", {
      clientId,
      clientSecret,
      ...(drive.client ? { pin } : {}),
    });
    if (a.status === 200 && a.data.ok) {
      setDrive((x) => ({
        ...x,
        client: { clientId: clientId.trim(), secretSet: true },
        ...(a.data.endedConnection ? { connected: false, account: null } : {}),
      }));
      setClientSecret("");
      setPin("");
      setAsk(null);
      setNote({ ok: true, text: local(d, "drive.clientSaved") });
      router.refresh();
      return;
    }
    setNote({ ok: false, text: problem(d, a) });
  };

  const connect = async () => {
    const a = await run("drive/connect", drive.connected ? { pin } : {});
    if (a.status === 200 && a.data.ok) {
      setPin("");
      setAsk(null);
      setCopied(false);
      setDrive((x) => ({
        ...x,
        pending: a.data.pending as DriveState["pending"],
      }));
      return;
    }
    setNote({ ok: false, text: problem(d, a) });
  };

  const disconnect = async () => {
    const a = await run("drive/disconnect", { pin });
    if (a.status === 200 && a.data.ok) {
      setPin("");
      setAsk(null);
      setList(null);
      setDrive((x) => ({
        ...x,
        connected: false,
        account: null,
        pending: null,
      }));
      setNote({ ok: true, text: local(d, "drive.done") });
      router.refresh();
      return;
    }
    setNote({ ok: false, text: problem(d, a) });
  };

  const loadList = async () => {
    setListBusy(true);
    const a = await call("GET", `${API}/drive/list`);
    setListBusy(false);
    if (a.status === 200 && a.data.ok) {
      const o = a.data.overview as {
        freeBytes: number | null;
        totalBytes: number | null;
      };
      setList({
        rows: a.data.backups as DriveRow[],
        free: o.freeBytes,
        total: o.totalBytes,
      });
      return;
    }
    setNote({ ok: false, text: problem(d, a) });
  };

  const copy = async () => {
    if (!drive.pending) return;
    try {
      await navigator.clipboard.writeText(drive.pending.userCode);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const pinBox = (action: "client" | "reconnect" | "disconnect") =>
    ask === action ? (
      <Field
        id={`${uid}-${action}-pin`}
        label={local(d, "drive.pin")}
        hint={local(d, "drive.pinHint")}
        value={pin}
        onChange={setPin}
        secret
        disabled={busy}
        testId={`bk-pin-${action}`}
      />
    ) : null;

  const clientForm = (withPin: boolean) => (
    <div className="a2-scv a2-mt12">
      <Field
        id={`${uid}-cid`}
        label={local(d, "drive.clientId")}
        hint={local(d, "drive.clientIdHint")}
        value={clientId}
        onChange={setClientId}
        disabled={busy}
        testId="bk-client-id"
      />
      <Field
        id={`${uid}-csec`}
        label={local(d, "drive.clientSecret")}
        hint={local(d, "drive.clientSecretHint")}
        value={clientSecret}
        onChange={setClientSecret}
        secret
        disabled={busy}
        testId="bk-client-secret"
      />
      {withPin ? pinBox("client") : null}
      <div className="a2-gap8">
        <button
          type="button"
          className="a2-btn pri"
          onClick={saveClient}
          disabled={busy || !clientId.trim() || !clientSecret.trim()}
          aria-busy={busy || undefined}
          data-testid="bk-client-save"
        >
          {local(d, busy ? "drive.saving" : "drive.saveClient")}
        </button>
        {withPin ? (
          <button
            type="button"
            className="a2-btn"
            onClick={() => setAsk(null)}
            disabled={busy}
          >
            {local(d, "drive.cancel")}
          </button>
        ) : null}
      </div>
    </div>
  );

  return (
    <section
      className="a2-sc"
      id="a2s-drive"
      data-testid="bk-drive"
      data-state={
        drive.connected
          ? "connected"
          : drive.pending
            ? "pending"
            : drive.client
              ? "client"
              : "none"
      }
    >
      <div className="a2-sch">
        <div>
          <div className="a2-scw">{local(d, "drive.where")}</div>
          <h2 className="a2-h3">{local(d, "drive.title")}</h2>
          <p className="a2-scd">{local(d, "drive.desc")}</p>
        </div>
        <span
          className={`a2-pill ${drive.connected ? "ok" : "line"}`}
          data-testid="bk-drive-pill"
        >
          {local(d, drive.connected ? "kpi.connected" : "kpi.notConnected")}
        </span>
      </div>
      <div className="a2-scb">
        {!drive.client ? (
          <>
            <div className="a2-sm a2-b">{local(d, "drive.clientTitle")}</div>
            <p className="a2-xs a2-mute a2-mt12">
              {local(d, "drive.clientHelp")}
            </p>
            {canWrite ? clientForm(false) : null}
          </>
        ) : null}

        {drive.client && !drive.connected && !drive.pending ? (
          <>
            <div className="a2-sm a2-b">{local(d, "drive.connectTitle")}</div>
            <p className="a2-xs a2-mute a2-mt12">
              {local(d, "drive.clientOwn", { id: drive.client.clientId })}
            </p>
            {canWrite ? (
              <div className="a2-gap8 a2-mt12">
                <button
                  type="button"
                  className="a2-btn pri"
                  onClick={connect}
                  disabled={busy}
                  aria-busy={busy || undefined}
                  data-testid="bk-connect"
                >
                  <ShellIcon name="sync" size={14} />
                  {local(d, busy ? "drive.connecting" : "drive.connect")}
                </button>
              </div>
            ) : null}
          </>
        ) : null}

        {drive.pending ? (
          <div className="a2-card a2-mt12" data-testid="bk-code">
            <div className="a2-sm a2-b">{local(d, "drive.codeTitle")}</div>
            <div
              className="a2-kv a2-mono a2-mt12"
              aria-live="polite"
              data-testid="bk-user-code"
            >
              {drive.pending.userCode}
            </div>
            <p className="a2-xs a2-mute a2-mt12">
              {local(d, "drive.codeHelp")}
            </p>
            <div className="a2-gap8 a2-mt12">
              <button
                type="button"
                className="a2-btn"
                onClick={copy}
                data-testid="bk-copy"
              >
                <ShellIcon name={copied ? "check" : "file"} size={14} />
                {local(d, copied ? "drive.copied" : "drive.copy")}
              </button>
              <a
                className="a2-btn pri"
                href={drive.pending.verificationUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="bk-open"
              >
                <ShellIcon name="ext" size={14} />
                {local(d, "drive.open")}
              </a>
            </div>
            <p className="a2-xs a2-mute a2-mt12" role="status">
              {local(d, "drive.waiting")} ·{" "}
              {local(d, "drive.until", { time: when(drive.pending.expiresAt) })}
            </p>
          </div>
        ) : null}

        {drive.connected ? (
          <>
            <div className="a2-tblw">
              <table className="a2-tbl">
                <tbody>
                  <tr>
                    <td className="a2-tdh">
                      <b>{local(d, "drive.account")}</b>
                    </td>
                    <td data-testid="bk-account">{drive.account ?? "—"}</td>
                  </tr>
                  <tr>
                    <td className="a2-tdh">
                      <b>{local(d, "drive.folder")}</b>
                    </td>
                    <td data-testid="bk-folder">{drive.folderName ?? "—"}</td>
                  </tr>
                  <tr>
                    <td className="a2-tdh">
                      <b>{local(d, "drive.free")}</b>
                    </td>
                    <td>
                      {list
                        ? list.free === null
                          ? local(d, "drive.freeUnknown")
                          : sizeText(d, list.free, locale)
                        : "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="a2-xs a2-mute a2-mt12" data-testid="bk-keeps">
              {keepCopies > 0
                ? local(d, "drive.keeps", { n: keepCopies })
                : local(d, "drive.keepsDays")}
              {drive.client
                ? ` · ${local(d, "drive.clientOwn", { id: drive.client.clientId })}`
                : ""}
              {drive.lastTest
                ? ` · ${local(d, "drive.lastCheck", { time: when(drive.lastTest.at) })}`
                : ""}
            </p>
            {canWrite ? (
              <>
                {pinBox("disconnect")}
                {pinBox("reconnect")}
                {ask === "disconnect" ? (
                  <p className="a2-xs a2-mute">
                    {local(d, "drive.disconnectWarn")}
                  </p>
                ) : null}
                <div className="a2-gap8 a2-mt12">
                  {ask === "disconnect" ? (
                    <button
                      type="button"
                      className="a2-btn bad"
                      onClick={disconnect}
                      disabled={busy || !pin}
                      aria-busy={busy || undefined}
                      data-testid="bk-disconnect-ok"
                    >
                      {local(d, "drive.confirmDisconnect")}
                    </button>
                  ) : ask === "reconnect" ? (
                    <button
                      type="button"
                      className="a2-btn pri"
                      onClick={connect}
                      disabled={busy || !pin}
                      aria-busy={busy || undefined}
                      data-testid="bk-reconnect-ok"
                    >
                      {local(d, "drive.reconnect")}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="a2-btn"
                        onClick={() => setAsk("reconnect")}
                        data-testid="bk-reconnect"
                      >
                        {local(d, "drive.reconnect")}
                      </button>
                      <button
                        type="button"
                        className="a2-btn bad"
                        onClick={() => setAsk("disconnect")}
                        data-testid="bk-disconnect"
                      >
                        {local(d, "drive.disconnect")}
                      </button>
                    </>
                  )}
                  {ask === "disconnect" || ask === "reconnect" ? (
                    <button
                      type="button"
                      className="a2-btn"
                      onClick={() => {
                        setAsk(null);
                        setPin("");
                      }}
                      disabled={busy}
                    >
                      {local(d, "drive.cancel")}
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}
          </>
        ) : null}

        {drive.client && canWrite ? (
          <details
            className="a2-mt12 a2-more-opts"
            open={ask === "client"}
            onToggle={(e) =>
              setAsk(
                (e.currentTarget as HTMLDetailsElement).open
                  ? "client"
                  : ask === "client"
                    ? null
                    : ask,
              )
            }
          >
            <summary className="a2-sm a2-b">
              {local(d, "drive.changeClient")}
            </summary>
            <p className="a2-xs a2-mute a2-mt12">
              {local(d, "drive.changeWarn")}
            </p>
            {clientForm(true)}
          </details>
        ) : null}

        {!canWrite ? (
          <p className="a2-xs a2-mute a2-mt12">{local(d, "drive.readOnly")}</p>
        ) : null}
        {note ? <Note ok={note.ok} text={note.text} testId="bk-note" /> : null}
      </div>

      {drive.connected ? (
        <div className="a2-scb" data-testid="bk-list">
          <div className="a2-sm a2-b">{local(d, "list.title")}</div>
          <p className="a2-xs a2-mute">{local(d, "list.sub")}</p>
          {!list ? (
            <div className="a2-gap8 a2-mt12">
              <button
                type="button"
                className="a2-btn"
                onClick={loadList}
                disabled={listBusy}
                aria-busy={listBusy || undefined}
                data-testid="bk-list-load"
              >
                {local(d, listBusy ? "list.loading" : "list.load")}
              </button>
            </div>
          ) : list.rows.length === 0 ? (
            <p className="a2-sm a2-mt12">{local(d, "list.none")}</p>
          ) : (
            <div className="a2-tblw a2-mt12">
              <table className="a2-tbl">
                <thead>
                  <tr>
                    <th>{local(d, "list.when")}</th>
                    <th>{local(d, "list.files")}</th>
                    <th>{local(d, "list.size")}</th>
                    <th>{local(d, "list.state")}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="a2-tdh a2-mono">{r.name}</td>
                      <td data-l={local(d, "list.files")}>{r.files}</td>
                      <td data-l={local(d, "list.size")}>
                        {sizeText(d, r.bytes, locale)}
                      </td>
                      <td data-l={local(d, "list.state")}>
                        <span
                          className={`a2-pill ${r.checked ? "ok" : "line"}`}
                        >
                          {local(
                            d,
                            r.checked ? "list.checked" : "list.unchecked",
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
