import { Link } from "react-router-dom";
import { glassToSvg, listGlasses, recipes } from "@bartender/core";

export default function GlassesPage() {
  return (
    <>
      <section className="hero">
        <h1>Glassware</h1>
        <p className="lede">The glass shapes used in the diagrams. Capacities are what the level maths assumes.</p>
      </section>
      <section className="grid glasses-grid">
        {listGlasses().map((g) => {
          const used = recipes.search({ glass: g.id });
          return (
            <div key={g.id} className="card glass-card">
              <div className="card-diagram" dangerouslySetInnerHTML={{ __html: glassToSvg(g, { width: 120 }) }} />
              <div className="card-body">
                <h3>{g.name}</h3>
                <p className="small muted">
                  ~{g.capacityMl} ml · {used.length} {used.length === 1 ? "cocktail" : "cocktails"}
                </p>
                <p className="small">{g.description}</p>
                {used.length > 0 && (
                  <p className="small">
                    {used.slice(0, 6).map((r, i) => (
                      <span key={r.id}>
                        {i > 0 && ", "}
                        <Link to={`/cocktails/${r.id}`}>{r.name}</Link>
                      </span>
                    ))}
                    {used.length > 6 && <Link to={`/?glass=${g.id}`}> and {used.length - 6} more</Link>}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </section>
    </>
  );
}
