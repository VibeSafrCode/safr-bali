const header = document.querySelector("[data-public-auth-state]");
const accountStatus = document.querySelector("[data-public-account-status]");
const accountMobileStatus = document.querySelector("[data-public-account-mobile-status]");
const exchangeAction = document.querySelector("[data-exchange-auth-action]");
const exchangeAccountAction = document.querySelector("[data-exchange-account-action]");

function applyState(authenticated) {
  if (header) header.dataset.publicAuthState = authenticated ? "authenticated" : "guest";
  if (accountStatus) {
    accountStatus.textContent = authenticated
      ? accountStatus.dataset.signedInLabel
      : accountStatus.dataset.signedOutLabel;
  }
  if (accountMobileStatus) {
    accountMobileStatus.textContent = authenticated
      ? accountMobileStatus.dataset.signedInLabel
      : accountMobileStatus.dataset.signedOutLabel;
  }
  if (exchangeAction) {
    exchangeAction.textContent = authenticated
      ? exchangeAction.dataset.signedInLabel
      : exchangeAction.dataset.signedOutLabel;
    if (authenticated && exchangeAction.dataset.signedInHref) {
      exchangeAction.href = exchangeAction.dataset.signedInHref;
    }
  }
  if (exchangeAccountAction) exchangeAccountAction.hidden = !authenticated;
}

fetch("/api/web/auth/me", {
  credentials: "include",
  cache: "no-store",
  headers: { Accept: "application/json" },
})
  .then((response) => response.ok ? response.json() : null)
  .then((payload) => applyState(payload?.authenticated === true))
  .catch(() => applyState(false));
