import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { getSession, isStaffRole, displayName } from "@/lib/auth";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <>
      <SiteHeader user={session ? { name: displayName(session.profile), isStaff: isStaffRole(session.profile.role) } : null} />
      <main id="main">{children}</main>
      <SiteFooter />
    </>
  );
}
