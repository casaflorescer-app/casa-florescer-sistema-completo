import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { APP_PATHNAME_HEADER, isPublicPath } from "@/lib/auth/paths";
import { isSupabaseConfigured } from "./config";

type CookieToSet = {
  name: string;
  value: string;
  options?: Parameters<NextResponse["cookies"]["set"]>[2];
};

function nextWithPathname(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(APP_PATHNAME_HEADER, request.nextUrl.pathname);
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export async function updateSession(request: NextRequest): Promise<{
  response: NextResponse;
  user: User | null;
}> {
  // Reescrever o pedido (x-casa-pathname) e chamar o Auth aqui faz o Next
  // responder 307 para /login nas rotas públicas. Essas rotas não precisam
  // de sessão no servidor; o formulário trata o login no browser.
  if (isPublicPath(request.nextUrl.pathname)) {
    return { response: NextResponse.next(), user: null };
  }

  let response = nextWithPathname(request);
  if (!isSupabaseConfigured()) return { response, user: null };

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = nextWithPathname(request);
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { response, user };
}
