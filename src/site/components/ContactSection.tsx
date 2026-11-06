"use client";

import { FormEvent, useMemo, useState } from "react";
import { site, unpublished } from "@/site/data/site";

type Props = {
  titleAs?: "h1" | "h2";
  defaultSubject?: string;
};

type Errors = Partial<Record<"name" | "email" | "phone" | "subject" | "message", string>>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ContactSection({ titleAs = "h2", defaultSubject = "" }: Props) {
  const Title = titleAs;
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<"idle" | "ready" | "sent">("idle");
  const [notice, setNotice] = useState("");

  const subjectValue = useMemo(() => defaultSubject, [defaultSubject]);

  function validate(data: FormData): Errors {
    const next: Errors = {};
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const phone = String(data.get("phone") ?? "").trim();
    const subject = String(data.get("subject") ?? "").trim();
    const message = String(data.get("message") ?? "").trim();

    if (name.length < 2) next.name = "Please enter your name.";
    if (!emailPattern.test(email)) next.email = "Please enter a valid email address.";
    if (phone && phone.replace(/\D/g, "").length < 7) next.phone = "Please check the phone number.";
    if (subject.length < 2) next.subject = "Please add a subject.";
    if (message.length < 12) next.message = "Please write a short message.";
    return next;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (String(data.get("company") ?? "").trim()) return;

    const nextErrors = validate(data);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setStatus("idle");
      return;
    }

    const name = String(data.get("name")).trim();
    const email = String(data.get("email")).trim();
    const phone = String(data.get("phone") ?? "").trim();
    const subject = String(data.get("subject")).trim();
    const message = String(data.get("message")).trim();

    if (site.email) {
      const body = [`Name: ${name}`, `Email: ${email}`, phone ? `Phone: ${phone}` : "", "", message]
        .filter(Boolean)
        .join("\n");
      window.location.href = `mailto:${site.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      setStatus("sent");
      setNotice("Your email app should open with this message addressed to NCCS.");
      return;
    }

    setStatus("ready");
    setNotice(
      "Thank you. NCCS has not published an office email yet, so this form cannot deliver the message. Please visit the college in Gilgit.",
    );
  }

  const mapSrc = site.mapQuery
    ? `https://maps.google.com/maps?q=${encodeURIComponent(site.mapQuery)}&z=16&output=embed`
    : "";

  return (
    <section className="section band-white contact" id="contact">
      <div className="container contact-grid">
        <div>
          <p className="eyebrow">
            <span className="eyebrow-mark" aria-hidden="true" />
            Contact
          </p>
          <Title>Visit or Contact NCCS</Title>
          <p className="contact-name">{site.fullName}</p>
          <p>{site.location}</p>

          <dl className="contact-list">
            <div>
              <dt>Phone</dt>
              <dd>
                {site.phone ? (
                  <a href={`tel:${site.phone.replace(/\s/g, "")}`}>{site.phone}</a>
                ) : (
                  unpublished(site.phone)
                )}
              </dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>
                {site.email ? <a href={`mailto:${site.email}`}>{site.email}</a> : unpublished(site.email)}
              </dd>
            </div>
            <div>
              <dt>Office hours</dt>
              <dd>{unpublished(site.officeHours)}</dd>
            </div>
          </dl>

          {mapSrc ? (
            <div className="map">
              <iframe title="Map showing the location of NCCS" src={mapSrc} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
            </div>
          ) : null}
        </div>

        <form className="form" onSubmit={onSubmit} noValidate>
          <div className="hp" aria-hidden="true">
            <label htmlFor="company">Company</label>
            <input id="company" name="company" tabIndex={-1} autoComplete="off" />
          </div>

          <Field id="name" label="Name" error={errors.name} autoComplete="name" />
          <Field id="email" label="Email" type="email" error={errors.email} autoComplete="email" />
          <Field id="phone" label="Phone" type="tel" error={errors.phone} autoComplete="tel" required={false} />
          <Field id="subject" label="Subject" error={errors.subject} defaultValue={subjectValue} />
          <div className={`field${errors.message ? " is-invalid" : ""}`}>
            <label htmlFor="message">Message</label>
            <textarea id="message" name="message" rows={6} aria-invalid={Boolean(errors.message)} aria-describedby={errors.message ? "message-error" : undefined} />
            {errors.message ? (
              <p className="field-error" id="message-error">
                {errors.message}
              </p>
            ) : null}
          </div>

          <button className="btn btn-primary" type="submit">
            Send Message
          </button>

          {notice ? (
            <p className="form-note" role="status">
              {notice}
            </p>
          ) : null}
        </form>
      </div>
    </section>
  );
}

function Field({
  id,
  label,
  type = "text",
  error,
  autoComplete,
  required = true,
  defaultValue,
}: {
  id: string;
  label: string;
  type?: string;
  error?: string;
  autoComplete?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <div className={`field${error ? " is-invalid" : ""}`}>
      <label htmlFor={id}>
        {label}
        {required ? null : <span className="optional"> (optional)</span>}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        required={required}
      />
      {error ? (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
