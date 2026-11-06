import { statistics } from "@/site/data/statistics";

export function Statistics() {
  return (
    <section className="stats" aria-label="NCCS at a glance">
      {statistics.map((item) => (
        <div className="stat" key={item.value}>
          <strong>{item.value}</strong>
          <span>{item.label}</span>
        </div>
      ))}
    </section>
  );
}
