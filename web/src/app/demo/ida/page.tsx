import { redirect } from "next/navigation";

/**
 * `/demo/ida` — a friendly path alias for the Hurricane Ida flagship
 * historical sample. Every demo variant in this app (bertha, quiet, ida) is
 * actually driven by the `?demo=` query param on the root page (see
 * lib/useDashboard.ts's manifestUrl/demoTag) rather than a dedicated route
 * per variant; this route exists only because the task brief calls out
 * `/demo/ida` explicitly as a deliverable path, so it just redirects to the
 * query-param form.
 */
export default function DemoIdaPage() {
  redirect("/?demo=ida");
}
