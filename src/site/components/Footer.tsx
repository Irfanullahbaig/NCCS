import Link from "next/link";
import { Logo } from "@/site/components/Logo";
import { quickLinks } from "@/site/data/navigation";
import { site, socialLinks, unpublished, usefulLinks } from "@/site/data/site";

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <Logo compact />
          <p>{site.fullName}</p>
          <p>{site.location}</p>
          <p>Founded {site.founded}</p>
        </div>

        <div>
          <p className="footer-label">Quick Links</p>
          <ul>
            {quickLinks.map((item) => (
              <li key={item.href}>
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </div>

        {usefulLinks.length > 0 ? (
          <div>
            <p className="footer-label">Useful Links</p>
            <ul>
              {usefulLinks.map((item) => (
                <li key={item.href}>
                  <a href={item.href}>{item.label}</a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <p className="footer-label">Contact</p>
          <ul>
            <li>{site.streetAddress || site.location}</li>
            <li>
              Phone: {site.phone ? <a href={`tel:${site.phone.replace(/\s/g, "")}`}>{site.phone}</a> : unpublished(site.phone)}
            </li>
            <li>
              Email: {site.email ? <a href={`mailto:${site.email}`}>{site.email}</a> : unpublished(site.email)}
            </li>
          </ul>
          {socialLinks.length > 0 ? (
            <ul className="social">
              {socialLinks.map((item) => (
                <li key={item.href}>
                  <a href={item.href} rel="noreferrer">
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      <div className="container footer-bottom">
        <p>© 2026 NCCS — National College of Commerce and Computer Science. All rights reserved.</p>
        {/* Plain link: the staff dashboard has its own layout, so this is a full page load. */}
        <a className="staff-login" href="/login?next=/students">
          Staff login
        </a>
      </div>
    </footer>
  );
}
