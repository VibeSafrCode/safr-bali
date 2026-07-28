export type ApiErrorKind =
  | "authentication"
  | "configuration"
  | "http"
  | "invalid_response"
  | "network";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly details?: unknown;

  constructor(
    message: string,
    options: {
      kind: ApiErrorKind;
      status?: number;
      details?: unknown;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "ApiError";
    this.kind = options.kind;
    this.status = options.status;
    this.details = options.details;
  }
}

type ApiClientOptions = {
  baseUrl?: string;
  fetchImplementation?: typeof fetch;
  logger?: Pick<Console, "error">;
};

export function normalizeApiBaseUrl(value: string | undefined, origin: string) {
  const candidate = value?.trim() || origin;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch (error) {
    throw new ApiError("API base URL is invalid", {
      kind: "configuration",
      cause: error,
    });
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new ApiError("API base URL must use HTTP or HTTPS", {
      kind: "configuration",
    });
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ApiError("API base URL contains unsupported components", {
      kind: "configuration",
    });
  }
  return url.origin;
}

function isJson(response: Response) {
  const type = response.headers.get("content-type")?.toLowerCase() ?? "";
  return type.includes("application/json") || type.includes("+json");
}

export function createApiClient({
  baseUrl,
  fetchImplementation = fetch,
  logger = console,
}: ApiClientOptions = {}) {
  const origin = normalizeApiBaseUrl(baseUrl, window.location.origin);

  async function request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = new URL(path, `${origin}/`);
    let response: Response;
    try {
      response = await fetchImplementation(url, {
        credentials: "include",
        cache: "no-store",
        ...options,
        headers: {
          Accept: "application/json",
          ...options.headers,
        },
      });
    } catch (error) {
      logger.error({
        operation: "api_request",
        path: url.pathname,
        error_type: "network",
      });
      throw new ApiError("API network request failed", {
        kind: "network",
        cause: error,
      });
    }

    if (response.status === 204) return undefined as T;
    if (!isJson(response)) {
      throw new ApiError("API returned a non-JSON response", {
        kind: "invalid_response",
        status: response.status,
      });
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new ApiError("API returned invalid JSON", {
        kind: "invalid_response",
        status: response.status,
        cause: error,
      });
    }

    if (response.status === 401) {
      throw new ApiError("Authentication required", {
        kind: "authentication",
        status: 401,
        details: payload,
      });
    }
    if (!response.ok) {
      logger.error({
        operation: "api_response",
        path: url.pathname,
        status: response.status,
        error_type: "http",
      });
      throw new ApiError("API request failed", {
        kind: "http",
        status: response.status,
        details: payload,
      });
    }
    return payload as T;
  }

  return { origin, request };
}

export function appApiClient(options: Omit<ApiClientOptions, "baseUrl"> = {}) {
  return createApiClient({
    ...options,
    baseUrl: import.meta.env.VITE_API_BASE_URL,
  });
}

export function apiErrorMessage(error: unknown) {
  if (!(error instanceof ApiError)) {
    return "Не удалось связаться с SAFRWAY. Проверьте соединение и попробуйте снова.";
  }
  if (error.kind === "authentication") {
    return "Сессия истекла. Выполните вход ещё раз.";
  }
  if (error.kind === "configuration") {
    return "Приложение настроено неверно. Сообщите менеджеру.";
  }
  if (error.kind === "invalid_response") {
    return "Сервер вернул неожиданный ответ. Попробуйте позже.";
  }
  return "Не удалось получить данные. Проверьте соединение и попробуйте снова.";
}
