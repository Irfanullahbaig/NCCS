import { redirect } from "next/navigation";

/** Outstanding fees now live in the Accounts Receivable register. */
export default function OutstandingPage() {
  redirect("/finance/receivables?status=open");
}
