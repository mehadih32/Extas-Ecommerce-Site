import type { Metadata } from "next";
import dict from "../../../messages/status.bn.json";
import { t } from "@/lib/i18n";
import { dateTime, num } from "@/lib/format";
import { buildStatus, runtimeState, type Backup } from "@/lib/status";
import { displaySettings } from "@/lib/settings";
import type { DisplayOptions } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: t(dict, "title"),
  robots: { index: false, follow: false },
};

function Bar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-line"
      role="presentation"
    >
      <div className="h-full rounded-full bg-ok" style={{ width: `${pct}%` }} />
    </div>
  );
}

function backupLabel(
  b: Backup | null,
  d: DisplayOptions,
): { text: string; tone: string } {
  if (!b?.result) return { text: t(dict, "backupNone"), tone: "text-ink-soft" };
  if (b.result === "ok")
    return {
      text: `${t(dict, "backupOk")} · ${dateTime(b.at, d) ?? ""}`,
      tone: "text-ok",
    };
  if (b.result === "off")
    return { text: t(dict, "backupOff"), tone: "text-warn" };
  return { text: t(dict, "backupFail"), tone: "text-bad" };
}

export default async function StatusPage() {
  const s = buildStatus;
  // Locale and time zone through the settings resolver (PR 492) when the database answers, else the environment.
  const [{ deploy, health, backups, smoke }, d] = await Promise.all([
    runtimeState(),
    displaySettings(),
  ]);
  const problems = health?.problems ?? [];
  const sha = (deploy?.sha ?? s.commit).slice(0, 7);

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <h1 className="text-2xl font-semibold">{t(dict, "title")}</h1>
      <p className="mt-1 text-ink-soft">{t(dict, "subtitle")}</p>

      <section className="mt-6 rounded-xl border border-line bg-surface p-4">
        {s.launch ? (
          <>
            {/* CN-027: the Launch list first — the PRs needed before real orders */}
            <p className="text-lg font-semibold">
              {t(
                dict,
                s.launch.done >= s.launch.total ? "launchDone" : "launch",
                {
                  done: num(s.launch.done, d),
                  total: num(s.launch.total, d),
                  left: num(s.launch.total - s.launch.done, d),
                },
              )}
            </p>
            <div className="mt-3 mb-4">
              <Bar done={s.launch.done} total={s.launch.total} />
            </div>
          </>
        ) : null}
        <p className={s.launch ? "text-ink-soft" : "text-lg font-semibold"}>
          {t(dict, "total", {
            done: num(s.totals.done, d),
            active: num(s.totals.active, d),
          })}
        </p>
        <div className="mt-3">
          <Bar done={s.totals.done} total={s.totals.active} />
        </div>
        <p className="mt-3 text-sm text-ink-soft">
          {t(dict, "lastDeploy")}:{" "}
          {dateTime(deploy?.at ?? s.generatedAt, d) ?? t(dict, "never")}
          {sha ? ` · ${t(dict, "commit")} ${sha}` : ""}
        </p>
      </section>

      <section className="mt-4 rounded-xl border border-line bg-surface p-4">
        <h2 className="font-semibold">{t(dict, "waitingTitle")}</h2>
        {s.waiting.length === 0 ? (
          <p className="mt-2 text-ok">{t(dict, "waitingNone")}</p>
        ) : (
          <ol className="mt-2 list-decimal space-y-2 ps-5">
            {s.waiting.map((w) => (
              <li key={w.n}>
                <span className="font-semibold">{w.what}</span>
                {w.why ? (
                  <span className="block text-sm text-ink-soft">{w.why}</span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface p-4">
          <h2 className="font-semibold">{t(dict, "serverTitle")}</h2>
          {!health ? (
            <p className="mt-2 text-ink-soft">{t(dict, "serverUnknown")}</p>
          ) : problems.length === 0 ? (
            <p className="mt-2 text-ok">{t(dict, "serverOk")}</p>
          ) : (
            <ul className="mt-2 list-disc space-y-1 ps-5 text-bad">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {health?.at ? (
            <p className="mt-2 text-sm text-ink-soft">
              {t(dict, "serverChecked")}: {dateTime(health.at, d)}
            </p>
          ) : null}
          <h3 className="mt-4 text-sm font-semibold">
            {t(dict, "smokeTitle")}
          </h3>
          <p
            className={`mt-1 text-sm ${!smoke ? "text-ink-soft" : smoke.ok ? "text-ok" : "text-bad"}`}
          >
            {!smoke
              ? t(dict, "smokeNone")
              : smoke.ok
                ? t(dict, "smokeOk")
                : t(dict, "smokeFail", {
                    failed: num(Math.max(smoke.failed ?? 0, 1), d),
                  })}
            {smoke?.at ? ` · ${smoke.at.replace(/\s*\(.*\)$/, "")}` : ""}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <h2 className="font-semibold">{t(dict, "backupTitle")}</h2>
          <dl className="mt-2 space-y-1 text-sm">
            {(
              [
                ["backupLocal", backups.local],
                ["backupBlob", backups.blob],
                ["backupDrive", backups.drive],
              ] as const
            ).map(([k, b]) => {
              const l = backupLabel(b, d);
              return (
                <div key={k} className="flex flex-wrap justify-between gap-x-2">
                  <dt>{t(dict, k)}</dt>
                  <dd className={l.tone}>{l.text}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-line bg-surface p-4">
        <h2 className="font-semibold">{t(dict, "stagesTitle")}</h2>
        <ul className="mt-3 space-y-3">
          {s.stages.map((st) => (
            <li key={st.id}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0">
                  <span className="text-sm text-ink-soft">{st.id}</span>{" "}
                  {t(dict, `stages.${st.id}`)}
                </span>
                <span className="shrink-0 text-sm tabular-nums">
                  {st.parked
                    ? t(dict, "parked")
                    : t(dict, "stageDone", {
                        done: num(st.done, d),
                        total: num(st.total, d),
                      })}
                </span>
              </div>
              {st.parked ? null : (
                <div className="mt-1">
                  <Bar done={st.done} total={st.total} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
