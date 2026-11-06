import { Button } from "@/site/components/Button";

export default function NotFound() {
  return (
    <section className="section">
      <div className="container narrow">
        <p className="eyebrow">
          <span className="eyebrow-mark" aria-hidden="true" />
          NCCS
        </p>
        <h1>This page is not on the site.</h1>
        <p className="lede">The address may be out of date. You can return home or write to the college.</p>
        <div className="actions">
          <Button href="/">Back to Home</Button>
          <Button href="/contact" variant="secondary">
            Contact NCCS
          </Button>
        </div>
      </div>
    </section>
  );
}
