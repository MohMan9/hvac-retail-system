import { redirect } from "next/navigation";

// The app has no marketing/landing page — every visitor either lands in the
// dashboard (which enforces auth and bounces to /signin if needed) or is
// already signed in. Send the root straight there.
export default function Home() {
  redirect("/dashboard");
}
