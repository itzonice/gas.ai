import { Redirect } from "expo-router";

import { useSession } from "../session";

export default function Index() {
  const session = useSession();
  if (session.status === "loading") return null;
  return <Redirect href={session.status === "signed-in" ? "/today" : "/sign-in"} />;
}
