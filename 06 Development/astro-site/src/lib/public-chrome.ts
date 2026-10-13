// Server/build-only caption projection. Never import this helper into a client script.
// These 33 reviewed source mappings are not a route, service or release approval.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const PUBLIC_CHROME_LOCALES = Object.freeze(["ru", "en", "zh-Hans", "ko", "fr", "de", "ja", "hi", "es", "ar"] as const);
export type PublicChromeLocale = typeof PUBLIC_CHROME_LOCALES[number];
const expectedSources = {
  "header.navigationMenu": {
    "taskId": "I02_UI_013",
    "sourceKey": "inline:06 Development/astro-site/src/components/SiteHeader.astro#f13691b31195",
    "evidenceSha256": "63258d999e85ed9e11f802cbdbc04433a00a086d102020098e8a316f5dd90221",
    "ruEnSha256": "3c3294303376c012412c36c644c588db99b23caae808f849f8345a98a2e7fea4"
  },
  "header.countries": {
    "taskId": "I02_UI_012",
    "sourceKey": "inline:06 Development/astro-site/src/components/SiteHeader.astro#13ceaceb845e",
    "evidenceSha256": "ec029d33bcdcf7c310f7b86dd5d99bb2ecfe1c66a01abf7eb852ff6efd52ecf5",
    "ruEnSha256": "f6938e8cbd35bad123f3cb30def364fb0650b42b90aa6f923984f3c220ada4d5"
  },
  "header.services": {
    "taskId": "I02_UI_013",
    "sourceKey": "inline:06 Development/astro-site/src/components/SiteHeader.astro#9ac9e9c2a410",
    "evidenceSha256": "1c60c961fe8982dd2097820dd6e381c3b82a33ee942983337ce9b09cd5933c61",
    "ruEnSha256": "e360d428a0642ef48a86767699047f47a6bebf370a3f10bced4ca6d1eee43b74"
  },
  "header.videos": {
    "taskId": "I02_UI_013",
    "sourceKey": "inline:06 Development/astro-site/src/components/SiteHeader.astro#33cb8a3a354e",
    "evidenceSha256": "4e8fe2dec31a62d4f3c763f052232c5f1d9745db509f9a0fce2ad7d894bf2d6a",
    "ruEnSha256": "9f01c52999cfc9eff5439de37866ae1cd8bffc34fa7e42782363294270bf7218"
  },
  "header.help": {
    "taskId": "I02_UI_013",
    "sourceKey": "inline:06 Development/astro-site/src/components/SiteHeader.astro#5615deb92612",
    "evidenceSha256": "e048852fdb45ad92a897263e8a8a05eef1c20dc4e62ad11710a6e3ec73113154",
    "ruEnSha256": "7d73f8c82ee9426445de80f2a821c555067f3ca16ad7ea3bb7a4b47dd80da7f8"
  },
  "header.appearance": {
    "taskId": "I02_UI_013",
    "sourceKey": "inline:06 Development/astro-site/src/components/SiteHeader.astro#8e8c285c8bfd",
    "evidenceSha256": "6917d19500f025d70ce1be9091dc484ce64deb977d5e9bc25dbb851229c90cc4",
    "ruEnSha256": "94c92b0b71d36a03a0c289a9553d149100e436ff6fef9465fb93c7b87486fe3e"
  },
  "header.automaticAppearance": {
    "taskId": "I02_UI_013",
    "sourceKey": "inline:06 Development/astro-site/src/components/SiteHeader.astro#7e3d5337dd9a",
    "evidenceSha256": "4132bf960d2230c48fe35866d9eadd078981034087865d2bf7f4229a9c5f9575",
    "ruEnSha256": "d1176db3d7fa2bf221ca2e8f5a494d4d3c5d3159683ed4cd09522ad92e5bef9c"
  },
  "header.automaticTitle": {
    "taskId": "I02_UI_013",
    "sourceKey": "inline:06 Development/astro-site/src/components/SiteHeader.astro#24648e8c55ad",
    "evidenceSha256": "4c74234da43507a1adeff7f72cdbbec961683c1b24b367c02a2d396cf7e2067a",
    "ruEnSha256": "0820236516147a9541cb6df73bc6679e6cc7f37fea1466856b4ed9d5699237ea"
  },
  "header.autoLabel": {
    "taskId": "I02_UI_013",
    "sourceKey": "inline:06 Development/astro-site/src/components/SiteHeader.astro#67324d6c056f",
    "evidenceSha256": "9175c4e61eecbcb62680c657bd75be62d6c709a368ba56675d1c20ff0f2a4577",
    "ruEnSha256": "e8dd71dbe4b6270e4508fedc40e7db5966b0da4cf84bab0972d05285436be889"
  },
  "header.lightAppearance": {
    "taskId": "I02_UI_012",
    "sourceKey": "inline:06 Development/astro-site/src/components/SiteHeader.astro#152c6a578345",
    "evidenceSha256": "363607b3f3d13b1fbd3aac42ab05430a2684525cc6a819e95966a5a8f471c097",
    "ruEnSha256": "a7bbb550a0942ac4a987746a1081869b3babcd91bedbf1bf25307db64d75235e"
  },
  "header.lightLabel": {
    "taskId": "I02_UI_013",
    "sourceKey": "inline:06 Development/astro-site/src/components/SiteHeader.astro#a7d19f98e59b",
    "evidenceSha256": "63aeaafec829a96cdf7d3c79f18b8bf794dba3f4e06c5df2fa85ccbe09e5f67d",
    "ruEnSha256": "6fc49fee344c290b211fe5cbb92812587dbea609426ccf04786d9e83e8aa81aa"
  },
  "header.darkAppearance": {
    "taskId": "I02_UI_013",
    "sourceKey": "inline:06 Development/astro-site/src/components/SiteHeader.astro#ce156ca146ef",
    "evidenceSha256": "4803d30d748cead7c908db81c68c090077c292cb6f9639d73e0309bb0e66ae8d",
    "ruEnSha256": "fb43f35c0c7b1f395f0e520d50a633861124e1d0c34bb1b674d0ccc76fcdab79"
  },
  "header.darkLabel": {
    "taskId": "I02_UI_013",
    "sourceKey": "inline:06 Development/astro-site/src/components/SiteHeader.astro#4ce16bf354f0",
    "evidenceSha256": "2accf0b1f215d84e9f18d4248e06eb4b25b488ca044674a79b1d4df59930766f",
    "ruEnSha256": "551fd9db724e846f782d0ea1083302e9ab5183cd8b869a70606d90449856b798"
  },
  "header.appearanceAutomatic": {
    "taskId": "I02_UI_013",
    "sourceKey": "inline:06 Development/astro-site/src/components/SiteHeader.astro#e016f1e59f50",
    "evidenceSha256": "facd2518589c2d94108074ac344731591ceed65f123426db547a2662a53b49d6",
    "ruEnSha256": "df264a858d14b2d771d82c01ec1a01e3355293e44f43f404a5b0201e2cebaf99"
  },
  "header.myAccount": {
    "taskId": "I02_UI_013",
    "sourceKey": "inline:06 Development/astro-site/src/components/SiteHeader.astro#ae06b0a6d69d",
    "evidenceSha256": "48ea31ae44cc1af990f7c683a899c38f192574bccf6dea3bd0c363c1774799bc",
    "ruEnSha256": "1d98f7f2ccaac59a9128b769dce817cc29fb881f31b71ccfa5ecdacc7de08fb8"
  },
  "analytics.optional": {
    "taskId": "I02_UI_007",
    "sourceKey": "inline:06 Development/astro-site/src/components/AnalyticsConsent.astro#053bb01be1fd",
    "evidenceSha256": "cd5032d2e1d6b6151b39bc8ec42427e67014af5f1d73ece11d24e300492d344f",
    "ruEnSha256": "a36bbf8f3f5171861a81a689da6e89d0c0c10ef800c280e54313ecad432f3661"
  },
  "analytics.description": {
    "taskId": "I02_UI_007",
    "sourceKey": "inline:06 Development/astro-site/src/components/AnalyticsConsent.astro#ad3b2af30f1c",
    "evidenceSha256": "639875e21baa780fae983c8449bba0615f02fece1f0cf9055fa22a157a9cdc6a",
    "ruEnSha256": "b555a7e28af712d865aafc1502b8554d80d0414e4b30456afc0cf148db086961"
  },
  "analytics.privacy": {
    "taskId": "I02_UI_007",
    "sourceKey": "inline:06 Development/astro-site/src/components/AnalyticsConsent.astro#10769a2d99aa",
    "evidenceSha256": "ba9616a5fe48f8975e3e49ff3d0fbfce4b1867794b45c3ff46f41b1fc03c4a1b",
    "ruEnSha256": "efd80bccc2ad7beaec8a650adf3a2a0030005ac4b7080dcc276f8f0fad0ac97e"
  },
  "analytics.allow": {
    "taskId": "I02_UI_007",
    "sourceKey": "inline:06 Development/astro-site/src/components/AnalyticsConsent.astro#e5f8e3bb9e6f",
    "evidenceSha256": "5b11e8680f4207934b02eb098d108a52f786c2dd1b221967cb14208d3525b91f",
    "ruEnSha256": "ca4bd31d79711af7e3277bae620c4c0a3e58c6371692f541a0d15575a4ee737a"
  },
  "analytics.decline": {
    "taskId": "I02_UI_007",
    "sourceKey": "inline:06 Development/astro-site/src/components/AnalyticsConsent.astro#fec872a940f3",
    "evidenceSha256": "555b6fa428991956534de73666d392f25f52e72a7a39478eacc9801185c48874",
    "ruEnSha256": "5b9e7d3fddb4fcd6390933f3e946d3e43b387e6852f998f36552eb36318e5f52"
  },
  "analytics.preferences": {
    "taskId": "I02_UI_007",
    "sourceKey": "inline:06 Development/astro-site/src/components/AnalyticsConsent.astro#362469e97731",
    "evidenceSha256": "0d1b23dfabeb5dc11707beac816c3bb2c288043bf9d1dad3c740e2602afcbd33",
    "ruEnSha256": "bee162da3c6503f7d953ed945a2d659ad62962da0f8fc189c33fe65a1883f516"
  },
  "analytics.saveFailure": {
    "taskId": "I02_UI_005",
    "sourceKey": "inline:06 Development/astro-site/src/client/analytics.js#1aa8fd83d034",
    "evidenceSha256": "1e946f0dac9aa3d782e4dd159adb13d73f0afef2d2190819c1dee182496d0a19",
    "ruEnSha256": "cb83feadfa2686d7c997a9e6108bc31591ff1e69a87faffef40a46a2d9f606b7"
  },
  "dock.travelServices": {
    "taskId": "I02_UI_007",
    "sourceKey": "inline:06 Development/astro-site/src/components/AppDock.astro#2d4440be946a",
    "evidenceSha256": "969c7bfe96f1e7d147029b236cf4b305ecb7e450dc0a4066da38776941d107d3",
    "ruEnSha256": "72ccc3da458bf0fdbd0245a49d6d2cd9dc431f29fac778a4dac84ac32940b49a"
  },
  "dock.services": {
    "taskId": "I02_UI_007",
    "sourceKey": "inline:06 Development/astro-site/src/components/AppDock.astro#9ac9e9c2a410",
    "evidenceSha256": "5a94062a3344f633506a64ab9922ab818ee71def7b74dcfd6b9647e01c20699b",
    "ruEnSha256": "e360d428a0642ef48a86767699047f47a6bebf370a3f10bced4ca6d1eee43b74"
  },
  "dock.myRequests": {
    "taskId": "I02_UI_007",
    "sourceKey": "inline:06 Development/astro-site/src/components/AppDock.astro#aa89a62af10a",
    "evidenceSha256": "ad34b08f923f5ee69b5920bd0465b7556b87698f55825bc1b950284ffca29bce",
    "ruEnSha256": "2d6b20e0a537c8acd24282c1544a92d5ef51cdaebf82ef1b416913ea825d3da0"
  },
  "dock.support": {
    "taskId": "I02_UI_007",
    "sourceKey": "inline:06 Development/astro-site/src/components/AppDock.astro#a7d762aef9f7",
    "evidenceSha256": "082399689f1cac0131a06b6e82d45b60ff4fcf1e2197d273d6b3f031ad5893fc",
    "ruEnSha256": "ba320c12ff4b6596d6bc5fc755b3c12012942354bac9a05a7cf8573091577cbf"
  },
  "uae.backLabel": {
    "taskId": "I02_UI_009",
    "sourceKey": "inline:06 Development/astro-site/src/components/CountryApps.astro#db90a054b126",
    "evidenceSha256": "1459cfca953c8ec87960c150d26c2eb27fb6088017c283292fbe130ac5b9e7f9",
    "ruEnSha256": "d9bc7806bc4c20377ecc81cd6838363465391962e7232ad1f951032405c59991"
  },
  "uae.servicesEyebrow": {
    "taskId": "I02_UI_009",
    "sourceKey": "inline:06 Development/astro-site/src/components/CountryApps.astro#cc8065a62020",
    "evidenceSha256": "3e5837c65916575c7a02263d408dfc736997e7d2dafb79ca1b4dee8d91c9789f",
    "ruEnSha256": "461432b67b122c6e427d5c0ee4fcba81bd8a640a102105c9ed160954eb7867d1"
  },
  "uae.servicesHeading": {
    "taskId": "I02_UI_011",
    "sourceKey": "inline:06 Development/astro-site/src/components/HomeExperience.astro#61e849273d94",
    "evidenceSha256": "e8a7ff481bef240f261da3cb2d5b6049da372064360db82efca32dcf44c10955",
    "ruEnSha256": "02ce67ef0156bfd9489329af17a14d9e5b4f48fdeb6e2c99ca6c88c0a92494a9"
  },
  "uae.visas": {
    "taskId": "I02_UI_005",
    "sourceKey": "catalog.thailand.visas.name",
    "evidenceSha256": "d41d7bd3d725fd9f99ee7165156b27ad4c63a54a86304e481288746035a1c578",
    "ruEnSha256": "00b0f0b4522f63c8d647ef8b44beba5c535e2a063673c53c1eccfdc3f8d60bff"
  },
  "uae.insurance": {
    "taskId": "I02_UI_003",
    "sourceKey": "catalog.bali.insurance.name",
    "evidenceSha256": "c1bd177ab61c1b5a466f9a5c9f36013be9bc3388fb1b7c2543f690779dff3ce8",
    "ruEnSha256": "95bd363a4e8dbf8856617fff7dcc69ad5f8f5565ddc3e71b37aed1291a755886"
  },
  "uae.comingSoon": {
    "taskId": "I02_UI_065",
    "sourceKey": "ui.common.soon",
    "evidenceSha256": "723a4cac819d14a1d871993dd0e485538caa5c8b1be068c46a8bcdb202d84b67",
    "ruEnSha256": "0cde30dd58b81184f736fffe9ce4b67b2a4196d497bfec0cb79d53f7507ce512"
  },
  "uae.shortName": {
    "taskId": "I02_UI_010",
    "sourceKey": "inline:06 Development/astro-site/src/components/HomeExperience.astro#0408e0cf6cc8",
    "evidenceSha256": "cefd1baa02048d3c5dcd5d56854d94ddb15a0864e9993535aaa05a9a78d0343d",
    "ruEnSha256": "c98973654c9f0d959d64acc96fe3ac445c8abbd476f4235c18a6f6d2360b2d02"
  }
} as const;
export type PublicChromeKey = keyof typeof expectedSources;
export const PUBLIC_CHROME_KEYS = Object.freeze(Object.keys(expectedSources) as PublicChromeKey[]);
export const PUBLIC_CHROME_INPUT_SHA256 = "45d203211332f788cdc8e9febde27a5016350806232faaa4c836c146a8421ad2";
const candidatePin = "c7a9e9b1de0188369bd6f0bfd7d4b741d6d905be4d394b04f8ea9afd4fdbb7ed";
const inventoryPin = "c460688eaac9bf5f12d1b69b610d67a7538fb6c407c4064f85d8ac6e489cbbec";
const sourceIndexPin = "c2c590451f6532d5023a242b3c380d9956ce748802bbcacdbcb5be56d28cffd5";

function requireValue(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, child]) => [key, canonical(child)]));
  }
  return value;
}
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const fingerprint = (value: unknown) => sha(JSON.stringify(canonical(value)));
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const scalar = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 100000
  && !value.includes("\0")
  && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
const edges = (value: string) => [value.match(/^\s*/u)![0], value.match(/\s*$/u)![0]];
const tokens = (value: string) => (value.match(/\$?\{[^{}\r\n]*\}|[{}]|(?<![A-Za-z0-9_])(?:SAFRWAY|SAFR)(?![A-Za-z0-9_])/g) ?? []).sort();

/** No configurable digest, source substitution, fallback locale or approval override. */
export function createPublicChromeLookup(bytes: Uint8Array) {
  requireValue(bytes instanceof Uint8Array && bytes.byteLength > 0 && bytes.byteLength <= 1024 * 1024,
    "PUBLIC_CHROME_INPUT_BOUNDARY");
  const buffer = Buffer.from(bytes);
  requireValue(sha(buffer) === PUBLIC_CHROME_INPUT_SHA256, "PUBLIC_CHROME_INPUT_PIN_DRIFT");
  let text: string;
  try { text = new TextDecoder("utf-8", {fatal: true, ignoreBOM: true}).decode(buffer); }
  catch { throw new Error("PUBLIC_CHROME_INVALID_UTF8"); }
  const input = JSON.parse(text);
  requireValue(buffer.equals(Buffer.from(JSON.stringify(input, null, 2) + "\n")), "PUBLIC_CHROME_NONCANONICAL_INPUT");
  requireValue(input.schemaVersion === 1 && input.domain === "public"
    && input.status === "SOURCE_PINNED_PUBLIC_CHROME_SUBSET"
    && input.sourceCandidateSha256 === candidatePin && input.sourceInventorySha256 === inventoryPin
    && input.sourcePacketIndexSha256 === sourceIndexPin && same(input.locales, PUBLIC_CHROME_LOCALES)
    && input.sourceEquivalence === "PASS_WITH_LIMITATIONS"
    && input.nativeQa === "NOT_RUN" && input.legalQa === "NOT_RUN" && input.renderedQa === "NOT_RUN"
    && input.publicationAuthorized === false && input.newLocaleRoutesActivated === false
    && input.scope === "PUBLIC_CHROME_LOOKUP_ONLY_NO_ADMIN_OR_ARTICLES", "PUBLIC_CHROME_SOURCE_GATES");
  requireValue(Array.isArray(input.entries) && input.entries.length === PUBLIC_CHROME_KEYS.length,
    "PUBLIC_CHROME_WHITELIST_DRIFT");
  const entries = new Map<PublicChromeKey, Readonly<Record<PublicChromeLocale, string>>>();
  for (const [index, row] of input.entries.entries()) {
    const key = PUBLIC_CHROME_KEYS[index];
    const expected = expectedSources[key];
    requireValue(row.key === key && !entries.has(key) && row.sourceEquivalence === "PASS_WITH_LIMITATIONS"
      && row.sourceEvidence?.domain === "public"
      && row.sourceEvidence?.taskId === expected.taskId && row.sourceEvidence?.sourceKey === expected.sourceKey
      && fingerprint(row.sourceEvidence) === expected.evidenceSha256, "PUBLIC_CHROME_SOURCE_EVIDENCE");
    requireValue(row.values && same(Object.keys(row.values), PUBLIC_CHROME_LOCALES)
      && fingerprint({ru: row.values.ru, en: row.values.en}) === expected.ruEnSha256, "PUBLIC_CHROME_RU_EN_DRIFT");
    for (const locale of PUBLIC_CHROME_LOCALES) {
      const value = row.values[locale];
      requireValue(scalar(value) && value.trim() && !/<[^>]+>/.test(value), "PUBLIC_CHROME_INVALID_VALUE");
      requireValue(same(edges(value), edges(row.values.ru)) && same(tokens(value), tokens(row.values.ru)),
        "PUBLIC_CHROME_EDGE_OR_TOKEN_DRIFT");
    }
    entries.set(key, Object.freeze({...row.values}));
  }
  return (key: PublicChromeKey, locale: PublicChromeLocale): string => {
    requireValue(typeof key === "string" && entries.has(key), "PUBLIC_CHROME_UNKNOWN_KEY");
    requireValue(PUBLIC_CHROME_LOCALES.includes(locale), "PUBLIC_CHROME_UNKNOWN_LOCALE");
    return entries.get(key)![locale];
  };
}

function bundledInput(): Record<string, string> | null {
  try {
    return import.meta.glob(["../../../shared/content/client-ui/public-chrome.v1.json"],
      {query: "?raw", import: "default", eager: true}) as Record<string, string>;
  } catch (error) {
    if (typeof import.meta.glob !== "function") return null;
    throw error;
  }
}
const bundled = bundledInput();
const bytes = bundled
  ? Buffer.from(bundled["../../../shared/content/client-ui/public-chrome.v1.json"] ?? "", "utf8")
  : readFileSync(new URL("../../../shared/content/client-ui/public-chrome.v1.json", import.meta.url));
const lookup = createPublicChromeLookup(bytes);

/** Return customer strings only, never provenance, source paths, QA or routing data. */
export function publicChromeText(key: PublicChromeKey, locale: PublicChromeLocale) {
  return lookup(key, locale);
}
