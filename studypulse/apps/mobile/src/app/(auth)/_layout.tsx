// Signed-out screens. A signed-in user is sent to Today.
import { Redirect, Slot } from "expo-router";

import { useSession } from "../../session";

export default function AuthLayout() {
  const session = useSession();
  if (session.status === "signed-in") return <Redirect href="/today" />;
  return <Slot />;
}
