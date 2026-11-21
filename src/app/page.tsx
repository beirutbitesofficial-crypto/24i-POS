import { redirect } from "next/navigation";
import { homePath } from "@/server/actions/auth";

export default async function Home() {
  redirect(await homePath());
}
