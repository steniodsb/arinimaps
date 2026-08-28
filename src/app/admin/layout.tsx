import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import AdminShell from "./AdminShell";

const PAPEL_LABEL: Record<string, string> = {
  admin_central: "Diretoria",
  analista_arini: "Analista",
};

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  if (!["admin_central", "analista_arini"].includes(user.role)) redirect("/");

  return (
    <AdminShell nome={user.nome ?? ""} papel={PAPEL_LABEL[user.role] ?? user.role}>
      {children}
    </AdminShell>
  );
}
