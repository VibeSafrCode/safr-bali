import supplement from '../../../shared/content/client-ui/client-account-supplement.v1.json';
import {requireClientUiBindings,type ClientUiBindings} from './client-ui-bindings';
const fields = {
  "accountShellCopy.user": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountPageCopy.user"
  },
  "accountShellCopy.logout": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountShellCopy.logout"
  },
  "accountShellCopy.cabinet": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountShellCopy.cabinet"
  },
  "accountShellCopy.nav": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountShellCopy.nav"
  },
  "accountShellCopy.website": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountShellCopy.website"
  },
  "accountShellCopy.calculator": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountShellCopy.calculator"
  },
  "accountShellCopy.tabs.home": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountShellCopy.tabs.home"
  },
  "accountShellCopy.tabs.services": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountShellCopy.tabs.services"
  },
  "accountShellCopy.tabs.life": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountShellCopy.tabs.life"
  },
  "accountShellCopy.tabs.overview": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountShellCopy.tabs.overview"
  },
  "accountShellCopy.tabs.points": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountShellCopy.tabs.points"
  },
  "accountShellCopy.tabs.referrals": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountShellCopy.tabs.referrals"
  },
  "accountShellCopy.tabs.orders": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountShellCopy.tabs.orders"
  },
  "accountShellCopy.tabs.profile": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountShellCopy.tabs.profile"
  },
  "accountShellCopy.tabs.support": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountShellCopy.tabs.support"
  },
  "accountPageCopy.overview": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountPageCopy.overview"
  },
  "accountPageCopy.hello": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountPageCopy.hello"
  },
  "accountPageCopy.traveller": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountPageCopy.traveller"
  },
  "accountPageCopy.overviewLead": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountPageCopy.overviewLead"
  },
  "accountPageCopy.network": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountPageCopy.network"
  },
  "accountPageCopy.requests": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountPageCopy.requests"
  },
  "accountPageCopy.pointsBalance": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountPageCopy.pointsBalance"
  },
  "accountPageCopy.pointsBalanceHint": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountPageCopy.pointsBalanceHint"
  },
  "accountPageCopy.myRequests": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountPageCopy.myRequests"
  },
  "accountPageCopy.myRequestsHint": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountPageCopy.myRequestsHint"
  },
  "accountPageCopy.calculator": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountPageCopy.calculator"
  },
  "accountPageCopy.calculatorHint": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountPageCopy.calculatorHint"
  },
  "accountPageCopy.support": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountPageCopy.support"
  },
  "accountPageCopy.supportHint": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountPageCopy.supportHint"
  },
  "accountPageCopy.pointsLead": {
    "kind": "supplement",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountPageCopy.pointsLead"
  },
  "accountPageCopy.pointsUse": {
    "kind": "supplement",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountPageCopy.pointsUse"
  },
  "accountPageCopy.pointsUseHint": {
    "kind": "supplement",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountPageCopy.pointsUseHint"
  },
  "accountPageCopy.referralLead": {
    "kind": "supplement",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountPageCopy.referralLead"
  },
  "accountPageCopy.personalLink": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountPageCopy.personalLink"
  },
  "accountPageCopy.linkUnavailable": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountPageCopy.linkUnavailable"
  },
  "accountPageCopy.copied": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountPageCopy.copied"
  },
  "accountPageCopy.copy": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountPageCopy.copy"
  },
  "accountPageCopy.request": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountPageCopy.request"
  },
  "accountPageCopy.noOrders": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountPageCopy.noOrders"
  },
  "accountPageCopy.noOrdersHint": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountPageCopy.noOrdersHint"
  },
  "accountPageCopy.openCatalog": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountPageCopy.openCatalog"
  },
  "accountPageCopy.profile": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountPageCopy.profile"
  },
  "accountPageCopy.user": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountPageCopy.user"
  },
  "accountPageCopy.profileLead": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountPageCopy.profileLead"
  },
  "accountStatusCopy.loadingTitle": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountStatusCopy.loadingTitle"
  },
  "accountStatusCopy.loadingDetail": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountStatusCopy.loadingDetail"
  },
  "accountStatusCopy.login": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountStatusCopy.login"
  },
  "accountStatusCopy.loginPreparing": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountStatusCopy.loginPreparing"
  },
  "accountStatusCopy.loginDetail": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountStatusCopy.loginDetail"
  },
  "accountStatusCopy.preparingDetail": {
    "kind": "supplement",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountStatusCopy.preparingDetail"
  },
  "accountStatusCopy.loginButton": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountStatusCopy.loginButton"
  },
  "accountStatusCopy.website": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountStatusCopy.website"
  },
  "accountStatusCopy.errorTitle": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountStatusCopy.errorTitle"
  },
  "accountStatusCopy.retry": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountStatusCopy.retry"
  },
  "accountStatusCopy.eyebrow": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountStatusCopy.eyebrow"
  }
} as const;
type Field = keyof typeof fields;
function text(ui:ClientUiBindings,field:Field){
 const binding=requireClientUiBindings(ui),slot=fields[field];
 return slot.kind==='runtime'?binding.text(slot.key):supplement.entries[slot.key][binding.locale];
}
function project<T extends Record<string,Field>>(ui:ClientUiBindings,keys:T):Record<keyof T,string>{
 return Object.fromEntries(Object.entries(keys).map(([key,field])=>[key,text(ui,field)])) as Record<keyof T,string>;
}
const shellFields = {
  "user": "accountShellCopy.user",
  "logout": "accountShellCopy.logout",
  "cabinet": "accountShellCopy.cabinet",
  "nav": "accountShellCopy.nav",
  "website": "accountShellCopy.website",
  "calculator": "accountShellCopy.calculator"
} as const;
const tabs = {
  "home": "accountShellCopy.tabs.home",
  "services": "accountShellCopy.tabs.services",
  "life": "accountShellCopy.tabs.life",
  "overview": "accountShellCopy.tabs.overview",
  "points": "accountShellCopy.tabs.points",
  "referrals": "accountShellCopy.tabs.referrals",
  "orders": "accountShellCopy.tabs.orders",
  "profile": "accountShellCopy.tabs.profile",
  "support": "accountShellCopy.tabs.support"
} as const;
const pageFields = {
  "overview": "accountPageCopy.overview",
  "hello": "accountPageCopy.hello",
  "traveller": "accountPageCopy.traveller",
  "overviewLead": "accountPageCopy.overviewLead",
  "network": "accountPageCopy.network",
  "requests": "accountPageCopy.requests",
  "pointsBalance": "accountPageCopy.pointsBalance",
  "pointsBalanceHint": "accountPageCopy.pointsBalanceHint",
  "myRequests": "accountPageCopy.myRequests",
  "myRequestsHint": "accountPageCopy.myRequestsHint",
  "calculator": "accountPageCopy.calculator",
  "calculatorHint": "accountPageCopy.calculatorHint",
  "support": "accountPageCopy.support",
  "supportHint": "accountPageCopy.supportHint",
  "pointsLead": "accountPageCopy.pointsLead",
  "pointsUse": "accountPageCopy.pointsUse",
  "pointsUseHint": "accountPageCopy.pointsUseHint",
  "referralLead": "accountPageCopy.referralLead",
  "personalLink": "accountPageCopy.personalLink",
  "linkUnavailable": "accountPageCopy.linkUnavailable",
  "copied": "accountPageCopy.copied",
  "copy": "accountPageCopy.copy",
  "request": "accountPageCopy.request",
  "noOrders": "accountPageCopy.noOrders",
  "noOrdersHint": "accountPageCopy.noOrdersHint",
  "openCatalog": "accountPageCopy.openCatalog",
  "profile": "accountPageCopy.profile",
  "user": "accountPageCopy.user",
  "profileLead": "accountPageCopy.profileLead"
} as const;
const statusFields = {
  "loadingTitle": "accountStatusCopy.loadingTitle",
  "loadingDetail": "accountStatusCopy.loadingDetail",
  "login": "accountStatusCopy.login",
  "loginPreparing": "accountStatusCopy.loginPreparing",
  "loginDetail": "accountStatusCopy.loginDetail",
  "preparingDetail": "accountStatusCopy.preparingDetail",
  "loginButton": "accountStatusCopy.loginButton",
  "website": "accountStatusCopy.website",
  "errorTitle": "accountStatusCopy.errorTitle",
  "retry": "accountStatusCopy.retry",
  "eyebrow": "accountStatusCopy.eyebrow"
} as const;
export function clientAccountCopies(ui:ClientUiBindings){
 requireClientUiBindings(ui);
 return {shell:{...project(ui,shellFields),tabs:project(ui,tabs)},page:project(ui,pageFields),status:project(ui,statusFields)};
}
export function clientAccountInvitedCount(ui:ClientUiBindings,count:unknown){
 const binding=requireClientUiBindings(ui);
 if(typeof count!=='number'||!Number.isSafeInteger(count)||count<0)throw new Error('CLIENT_ACCOUNT_COUNT_INVALID');
 const forms:Readonly<Partial<Record<Intl.LDMLPluralRule,string>>>=supplement.invited[binding.locale];
 const category=new Intl.PluralRules(binding.locale).select(count),pattern=forms[category]??forms.other;
 if(!pattern||pattern.split('{count}').length!==2)throw new Error('CLIENT_ACCOUNT_PLURAL_INVALID');
 return pattern.replace('{count}',String(count));
}
