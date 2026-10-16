import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => request.cookies.getAll(), setAll: (items) => { items.forEach(({ name, value }) => request.cookies.set(name, value)); response = NextResponse.next({ request }); items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)); } } });
  // Refresh the Supabase session cookie on every navigation so it stays valid as long as the user is active.
  await supabase.auth.getSession();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user && request.nextUrl.pathname !== "/login") { const url = request.nextUrl.clone(); url.pathname = "/login"; return NextResponse.redirect(url); }
  if (user && request.nextUrl.pathname === "/login") { const url = request.nextUrl.clone(); url.pathname = "/"; return NextResponse.redirect(url); }
  return response;
}
export const config = {
  matcher: ["/((?!api/telegram/webhook|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
