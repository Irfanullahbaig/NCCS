"use client";

import { FormEvent, useState } from "react";
import { site } from "@/site/data/site";

type Errors = Partial<Record<"name" | "email" | "phone" | "message", string>>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function HeroInquiry() {
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState("");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (String(data.get("company") ?? "").trim()) return;

    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const phone = String(data.get("phone") ?? "").trim();
    const message = String(data.get("message") ?? "").trim();
    const next: Errors = {};

    if (name.length < 2) next.name = "Please enter your name.";
    if (!emailPattern.test(email)) next.email = "Enter a valid email.";
    if (phone.replace(/\D/g, "").length < 7) next.phone = "Enter a phone number.";
    if (message.length < 8) next.message = "Please write a short message.";

    setErrors(next);
    if (Object.keys(next).length > 0) {
      setNotice("");
      return;
    }

    if (site.email) {
      const body = [`Name: ${name}`, `Email: ${email}`, `Phone: ${phone}`, "", message].join("\n");
      window.location.href = `mailto:${site.email}?subject=${encodeURIComponent("Inquiry from the NCCS website")}&body=${encodeURIComponent(body)}`;
      setNotice("Your email app should open with this message addressed to NCCS.");
      return;
    }

    setNotice("Thank you. NCCS has not published an office email yet, so this form cannot deliver the message. Please visit the college in Gilgit.");
  }

  return (
    <form className="inquiry" onSubmit={onSubmit} noValidate>
      <div className="hp" aria-hidden="true">
        <label htmlFor="inquiry-company">Company</label>
        <input id="inquiry-company" name="company" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="inquiry-head">
        <h2>Send a message</h2>
        <p>A short note to the college office.</p>
      </div>
      <div className="inquiry-pair">
        <InquiryField id="inquiry-name" name="name" label="Name" autoComplete="name" error={errors.name} />
        <InquiryField id="inquiry-email" name="email" label="Email" type="email" autoComplete="email" error={errors.email} />
      </div>
      <InquiryField id="inquiry-phone" name="phone" label="Phone" type="tel" autoComplete="tel" error={errors.phone} />
      <div className={`field${errors.message ? " is-invalid" : ""}`}>
        <label htmlFor="inquiry-message">Message</label>
        <textarea
          id="inquiry-message"
          name="message"
          rows={2}
          aria-invalid={Boolean(errors.message)}
          aria-describedby={errors.message ? "inquiry-message-error" : undefined}
        />
        {errors.message ? (
          <p className="field-error" id="inquiry-message-error">
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
  );
}

function InquiryField({
  id,
  name,
  label,
  type = "text",
  autoComplete,
  error,
}: {
  id: string;
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  error?: string;
}) {
  return (
    <div className={`field${error ? " is-invalid" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error ? (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
