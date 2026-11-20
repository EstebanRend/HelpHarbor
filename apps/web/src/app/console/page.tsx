import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agent console",
};

const queueViews = ["Unassigned", "Mine", "Breach risk", "Pending customer", "All open"] as const;

export default function ConsolePage() {
  return (
    <div className="console">
      <header className="console__header">
        <span className="brand">HelpHarbor</span>
        <span className="workspace" aria-label="Current workspace">
          No workspace selected
        </span>
      </header>

      <main id="main" className="console__panes">
        <section className="pane" aria-labelledby="queue-heading">
          <h2 id="queue-heading">Queue</h2>
          <nav aria-label="Queue views">
            <ul className="views">
              {queueViews.map((view) => (
                <li key={view}>
                  <button type="button" disabled>
                    {view}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <p className="empty">Tickets appear here once inbound email is connected.</p>
        </section>

        <section className="pane pane--wide" aria-labelledby="conversation-heading">
          <h2 id="conversation-heading">Conversation</h2>
          <p className="empty">Select a ticket to read the conversation and reply.</p>
        </section>

        <aside className="pane" aria-labelledby="properties-heading">
          <h2 id="properties-heading">Properties</h2>
          <dl className="properties">
            <dt>Status</dt>
            <dd>—</dd>
            <dt>Priority</dt>
            <dd>—</dd>
            <dt>Assignee</dt>
            <dd>—</dd>
            <dt>First response due</dt>
            <dd>—</dd>
          </dl>
        </aside>
      </main>
    </div>
  );
}
