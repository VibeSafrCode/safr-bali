/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __SAFRWAY_BUILD_ID__: string;
declare const __YOGA_MINI_APP__: boolean;
