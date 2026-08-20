# Project Overview

Evidence date: 2026-08-20. Product facts below come from the canonical project
documents and the CPO packet relayed for `BALI-TASK-056`.

## Purpose

SAFRWAY is a Bali-first assisted-service ecosystem. Its intended journey is:

`public discovery → authenticated action and/or a human manager`.

The product reduces uncertainty around relocation, travel, visas, housing,
local services, and exchange. It combines structured information and software
with manager-assisted conversion; it is not positioned as a fully automated
self-service marketplace.

## Users and actors

- prospective clients discovering countries and services;
- authenticated Telegram Mini App users;
- browser-account users where authentication capability is available;
- managers and administrators handling consultation, orders, support, and
  operational workflows;
- content/product/engineering/release owners maintaining verified facts and
  approval gates.

## Product surfaces

| Surface | Job | Current label |
| --- | --- | --- |
| Public Astro site | Country/service/detail discovery, SEO, manager or authentication handoff | `DEPLOYED` |
| Telegram bot | Information, manager contact, Mini App entry, concise workflow summaries | `DEPLOYED` |
| React Mini App | Catalog, authenticated calculator, orders, account, support | `DEPLOYED` |
| Browser account | Account foundation and shared authenticated experience | `DEPLOYED` foundation; parity gaps remain |
| React admin | Protected operational administration | `DEPLOYED` |
| Visa Cabinet / CRM | Manual-first visa lifecycle, client cabinet, admin workflow, notifications | `LOCAL_ONLY` active sprint |

## Confirmed journeys

- Public: country → service → detail → manager/authentication.
- Telegram: information → manager or Mini App.
- Mini App: catalog/calculator/orders/account/support.
- Browser: account foundation.
- Next approved direction: Visa Cabinet with full detail in Mini App/account
  and a Telegram summary plus CTA.

## Confirmed scope facts

- The public contract contains 44 source routes. Home is the sole discovery
  hub; root redirects preserve intended navigation.
- Bali has active content and is product priority `P0`.
- Thailand is an assisted-consultation direction with four services explicitly
  shown as preparing. The architecture should be Thailand-ready without
  inventing Thai rules or availability.
- Authenticated surfaces and the preliminary exchange calculator are live;
  conversion remains manager-assisted.
- A public functional calculator is excluded. The public exchange page may
  direct users to the canonical authenticated route only.
- Visa and privacy pages remain noindex in RU and EN until their separate
  content/cutover gates are satisfied.

## Audit scope

The audit should test whether the current product is understandable, coherent,
secure, maintainable, evidence-backed, and appropriately simple. It should
cover public/authenticated/human boundaries, information architecture, RU/EN
parity, source-of-truth discipline, data flows, release governance, and the
`LOCAL_ONLY` Visa Cabinet design.

It must not make product or technical decisions. Recommendations are
`PROPOSED` and require owner review and Founder approval where applicable.

## Approved design doctrine for the review

- Prefer Jobs-era simplicity, Apple-HIG clarity, and Telegram-native safe-area
  behavior; remove elements that do not improve context, action, or trust.
- Within 3–5 seconds, a first-time user should understand the country, the
  available action, and the next step.
- Review Astro public, Mini App, account, and admin as one coherent system; do
  not propose isolated page redesigns.
- Required responsive widths: `320`, `360`, `390`, and `1440` CSS pixels.
- Accessibility baseline: targets at least 44px, sufficient contrast,
  keyboard/focus-visible support, reduced motion, semantic statuses, no
  color-only meaning, and no horizontal overflow.
- Information hierarchy is country → location → service → offer. Each page has
  one distinct job. Photographic context must match the route level; a service
  photo is used only when verified.
- Data and API contracts are sources of truth. Visual references guide
  composition/style and never authorize invented data, counts, managers, SLAs,
  availability, prices, or features.

This doctrine is approved evidence relayed for BALI-TASK-056; a later Designer
packet may refine it without retroactively changing this audit snapshot.
