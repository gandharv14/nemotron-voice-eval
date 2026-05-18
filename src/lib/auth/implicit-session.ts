type ParsedImplicitSession =
  | {
      type: "session";
      accessToken: string;
      refreshToken: string;
      next: string;
    }
  | {
      type: "error";
      message: string;
    }
  | {
      type: "empty";
    };

export function parseImplicitSessionHash(hash: string, fallbackNext = "/dashboard"): ParsedImplicitSession {
  const trimmedHash = hash.startsWith("#") ? hash.slice(1) : hash;

  if (!trimmedHash) {
    return { type: "empty" };
  }

  const params = new URLSearchParams(trimmedHash);
  const errorDescription = params.get("error_description");
  const error = params.get("error");

  if (errorDescription || error) {
    return {
      type: "error",
      message: errorDescription ?? error ?? "Could not complete sign-in."
    };
  }

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");

  if (!accessToken || !refreshToken) {
    return { type: "empty" };
  }

  return {
    type: "session",
    accessToken,
    refreshToken,
    next: safeNext(params.get("next") ?? fallbackNext)
  };
}

export function safeNext(value: string | null | undefined, fallback = "/dashboard") {
  return value?.startsWith("/") && !value.startsWith("//") ? value : fallback;
}
