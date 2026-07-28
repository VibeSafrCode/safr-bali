type ApiErrorKind =
  | "authentication"
  | "configuration"
  | "http"
  | "invalid_response"
  | "network";

export class ApiClientError extends Error {
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
    this.name = "ApiClientError";
    this.kind = options.kind;
    this.status = options.status;
    this.details = options.details;
  }
}

type FetchImplementation = typeof fetch;

type ApiClientOptions = {
  baseUrl: string | undefined;
  fetchImplementation?: FetchImplementation;
  logger?: Pick<Console, "error">;
};

function normalizeApiBaseUrl(value: string | undefined) {
  if (!value?.trim()) {
    throw new ApiClientError("API base URL is not configured", {
      kind: "configuration",
    });
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new ApiClientError("API base URL is invalid", {
      kind: "configuration",
      cause: error,
    });
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new ApiClientError("API base URL must use HTTP or HTTPS", {
      kind: "configuration",
    });
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ApiClientError("API base URL contains unsupported components", {
      kind: "configuration",
    });
  }

  return url.origin;
}

function isJsonResponse(response: Response) {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  return (
    contentType.includes("application/json") ||
    contentType.includes("+json")
  );
}

export function createApiClient({
  baseUrl,
  fetchImplementation = fetch,
  logger = console,
}: ApiClientOptions) {
  const origin = normalizeApiBaseUrl(baseUrl);

  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const operationUrl = new URL(path, `${origin}/`);
    let response: Response;

    try {
      response = await fetchImplementation(operationUrl, {
        credentials: "include",
        ...options,
        headers: {
          Accept: "application/json",
          ...options.headers,
        },
      });
    } catch (error) {
      const apiError = new ApiClientError("API network request failed", {
        kind: "network",
        cause: error,
      });
      logger.error({
        operation: "api_request",
        path: operationUrl.pathname,
        kind: apiError.kind,
      });
      throw apiError;
    }

    if (!isJsonResponse(response)) {
      const apiError = new ApiClientError("API returned a non-JSON response", {
        kind: "invalid_response",
        status: response.status,
      });
      logger.error({
        operation: "api_response",
        path: operationUrl.pathname,
        kind: apiError.kind,
        status: response.status,
      });
      throw apiError;
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      const apiError = new ApiClientError("API returned invalid JSON", {
        kind: "invalid_response",
        status: response.status,
        cause: error,
      });
      logger.error({
        operation: "api_response",
        path: operationUrl.pathname,
        kind: apiError.kind,
        status: response.status,
      });
      throw apiError;
    }

    if (response.status === 401) {
      throw new ApiClientError("API authentication is required", {
        kind: "authentication",
        status: response.status,
        details: payload,
      });
    }
    if (!response.ok) {
      const apiError = new ApiClientError("API request failed", {
        kind: "http",
        status: response.status,
        details: payload,
      });
      logger.error({
        operation: "api_response",
        path: operationUrl.pathname,
        kind: apiError.kind,
        status: response.status,
      });
      throw apiError;
    }

    return payload as T;
  }

  return { origin, request };
}

export function miniAppApiClient(options: Omit<ApiClientOptions, "baseUrl"> = {}) {
  return createApiClient({
    ...options,
    baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
  });
}

export function apiErrorMessage(error: unknown) {
  if (!(error instanceof ApiClientError)) {
    return "Не удалось связаться с SAFR. Проверьте соединение и попробуйте снова.";
  }
  if (error.kind === "authentication") {
    return "Сессия Telegram истекла. Закройте Mini App и откройте её снова из бота.";
  }
  if (error.kind === "configuration") {
    return "Mini App временно настроена неверно. Мы уже можем исправить это без ваших данных.";
  }
  if (error.kind === "invalid_response") {
    return "Сервер вернул неожиданный ответ. Обновите Mini App немного позже.";
  }
  return "Не удалось получить данные. Проверьте соединение и попробуйте снова.";
}
