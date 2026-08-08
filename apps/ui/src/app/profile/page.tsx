import type { Metadata } from "next";

import AccountClient from "./AccountClient";

export const metadata: Metadata = {
  title: "Account | Frog Trading Exchange",
  description: "Manage your Frog Trading Exchange account and wallets.",
  alternates: {
    canonical: "/profile",
  },
};

export default function ProfilePage() {
  return <AccountClient />;
}
