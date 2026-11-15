// Reports (prototype v5 "This report answers"): the navy card at the top of a report — the one question the report answers and two
// or three plain lines worked out from the page's own figures, each with the button that acts on it. Server component; lines
// are computed by the page from real data (nothing typed in here). Hidden when there is nothing to say.
import Link from "next/link";
import type { ReactNode } from "react";
import { ShellIcon } from "../shell/ShellIcon";
import "./report-answers.css";

export interface AnswerLine {
  text: ReactNode;
  tone?: "good" | "bad";
  act?: { label: string; href: string };
}

export function ReportAnswers({
  kicker,
  question,
  lines,
  testId = "rp-answers",
  empty,
}: {
  kicker: string;
  question: string;
  lines: readonly AnswerLine[];
  testId?: string;
  empty?: string;
}) {
  const shown = lines.slice(0, 3);
  if (!shown.length && !empty) return null;
  return (
    <section className="rpa a2-mt12" aria-label={question} data-testid={testId}>
      <div className="rpa-ico" aria-hidden="true">
        <ShellIcon name="chart" size={20} />
      </div>
      <div className="rpa-main">
        <div className="rpa-k">{kicker}</div>
        <h2 className="rpa-q">{question}</h2>
        <ul>
          {!shown.length && empty ? (
            <li data-testid="rp-answer-line">
              <i aria-hidden="true" />
              <span>{empty}</span>
            </li>
          ) : null}
          {shown.map((l, i) => (
            <li key={i} data-testid="rp-answer-line">
              <i className={l.tone ?? ""} aria-hidden="true" />
              <span>{l.text}</span>
              {l.act ? (
                <Link className="rpa-act" href={l.act.href}>
                  {l.act.label} →
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
