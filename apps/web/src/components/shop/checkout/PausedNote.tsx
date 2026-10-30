// CN-029 Phase 3 qa-gate I3 (PR 610) — the calm line the bag and the checkout show while checkout is paused (the ERP
// holds the shop's account and `erp.hold.pauseCheckout` is on): on screen from the moment the page opens and for as
// long as the pause lasts, never a toast. The words come from the shop's messages (`checkout.paused.*`): nothing
// personal and nothing about the ERP. No hooks: the bag (server) and the checkout's form (client) both draw it.
import { Icon } from '../Icon';

export function PausedNote({ title, text, testId }: { title: string; text: string; testId: string }) {
  return (
    <div className="card p16 row sh-paused" role="status" data-testid={testId} id={testId}>
      <span className="bg-ic">
        <Icon name="clock" size={20} />
      </span>
      <div className="grow">
        <div className="h3">{title}</div>
        <div className="small text2">{text}</div>
      </div>
    </div>
  );
}
