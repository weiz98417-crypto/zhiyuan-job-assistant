import { redirect } from "next/navigation";

export default function ExplorePage() {
  redirect("/agent?tab=explore");
}
