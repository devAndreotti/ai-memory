import { Construction } from "lucide-react";

type UnderConstructionProps = {
  title: string;
  description: string;
};

export function UnderConstruction({ title, description }: UnderConstructionProps) {
  const headingId = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-title`;

  return (
    <section className="graph-construction" aria-labelledby={headingId}>
      <Construction size={34} aria-hidden="true" />
      <div>
        <span className="section-kicker">Preview</span>
        <h2 id={headingId}>{title}</h2>
        <p>{description}</p>
      </div>
    </section>
  );
}

export function GraphExplorer() {
  return (
    <UnderConstruction
      title="Graph em construção"
      description="Estamos preparando visualização de páginas e wikilinks. Esta área ficará disponível em breve."
    />
  );
}
