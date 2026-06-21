import Link from 'next/link';

export default function HomePage() {
  return (
    <section className="control-room">
      <div className="topline">
        <span>cf-tamac management</span>
        <span className="signal">server-side shell</span>
      </div>
      <div className="hero-grid">
        <div>
          <p className="kicker">Agent registry</p>
          <h1>Control without leaking keys.</h1>
          <p className="lead">
            Manage Agent records, origins, and credential references from a Client Worker boundary.
            Browser-delivered code stays out of direct Agent RPC execution.
          </p>
          <div className="action-row">
            <Link className="primary-action" href="/agents">
              Open registry
            </Link>
            <Link className="nav-link" href="/agents/new">
              Register Agent
            </Link>
          </div>
        </div>
        <aside className="instrument-panel" aria-label="Client boundary summary">
          <div className="readout">
            <strong>Owns</strong>
            <span>Managed Agent ledger, RPC origin metadata, credential references.</span>
          </div>
          <div className="readout">
            <strong>Excludes</strong>
            <span>Agent snapshots, direct browser RPC calls, public Agent proxy routes.</span>
          </div>
          <div className="readout">
            <strong>Runtime</strong>
            <span>Next.js App Router on Cloudflare Workers through OpenNext.</span>
          </div>
        </aside>
      </div>
    </section>
  );
}
