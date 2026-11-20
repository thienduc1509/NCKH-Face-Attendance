import { redirect } from "next/navigation"

export default function RegisterRedirect(): never {
  redirect("/login")
}
