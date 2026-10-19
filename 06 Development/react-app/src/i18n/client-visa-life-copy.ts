import supplement from '../../../shared/content/client-ui/client-visa-life-supplement.v1.json';
import {YOGA_MINI_APP} from '../runtime/yoga-mini-app';
import {requireClientUiBindings,type ClientUiBindings} from './client-ui-bindings';
import {clientJourneyText} from './client-catalog-journey';
import type {ClientRuntimeVariables} from './client-runtime';
// The data seam must be conditional itself. A throw inside a called function
// does not make an unconditional JSON import disappear from Yoga's output.
const entries=YOGA_MINI_APP?null:supplement.entries;

/** Explicit accepted customer-copy identities only. Source gaps are errors, never
 * RUEN fallback or a claim that either whole screen is ready in ten languages. */
const fields = YOGA_MINI_APP?null:{
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.UNKNOWN": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.UNKNOWN"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.SUBMITTED": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.SUBMITTED"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.WAITING_PAYMENT": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.WAITING_PAYMENT"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.PAID": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.PAID"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.WAITING_VERIFICATION": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.WAITING_VERIFICATION"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.PROCESSING": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.PROCESSING"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.ACTION_REQUIRED": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.ACTION_REQUIRED"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.BIOMETRICS_REQUIRED": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.BIOMETRICS_REQUIRED"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.INTERVIEW_REQUIRED": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.INTERVIEW_REQUIRED"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.WAITING_OFFICER_CONFIRMATION": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.WAITING_OFFICER_CONFIRMATION"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.RECOMMENDED_APPROVAL": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.RECOMMENDED_APPROVAL"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.WAITING_DECISION": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.WAITING_DECISION"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.APPROVED": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.APPROVED"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.AWAITING_ISSUANCE": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.AWAITING_ISSUANCE"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.ISSUED": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.ISSUED"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.FINALISED": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.FINALISED"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.REJECTED": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.REJECTED"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.CANCELLED": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#external.label.CANCELLED"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.UNKNOWN": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.UNKNOWN"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.SUBMITTED": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.SUBMITTED"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.WAITING_PAYMENT": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.WAITING_PAYMENT"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.PAID": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.PAID"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.WAITING_VERIFICATION": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.WAITING_VERIFICATION"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.PROCESSING": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.PROCESSING"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.ACTION_REQUIRED": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.ACTION_REQUIRED"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.BIOMETRICS_REQUIRED": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.BIOMETRICS_REQUIRED"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.INTERVIEW_REQUIRED": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.INTERVIEW_REQUIRED"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.WAITING_OFFICER_CONFIRMATION": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.WAITING_OFFICER_CONFIRMATION"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.RECOMMENDED_APPROVAL": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.RECOMMENDED_APPROVAL"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.WAITING_DECISION": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.WAITING_DECISION"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.APPROVED": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.APPROVED"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.AWAITING_ISSUANCE": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.AWAITING_ISSUANCE"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.ISSUED": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.ISSUED"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.FINALISED": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.FINALISED"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.REJECTED": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.REJECTED"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.CANCELLED": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.CANCELLED"},
  "source:06 Development/react-app/src/components/VisaStatusHelp.tsx#help.visa.fallback": {kind: "supplement", key: "source:06 Development/react-app/src/components/VisaStatusHelp.tsx#help.visa.fallback"},
  "source:06 Development/react-app/src/components/visaEditorState.ts#help.external.fallback": {kind: "supplement", key: "source:06 Development/react-app/src/components/visaEditorState.ts#help.external.fallback"},
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#lifecycle.NOT_ISSUED": {kind: "supplement", key: "source:06 Development/react-app/src/components/VisaCabinet.tsx#lifecycle.NOT_ISSUED"},
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#lifecycle.ISSUED_NOT_ACTIVATED": {kind: "supplement", key: "source:06 Development/react-app/src/components/VisaCabinet.tsx#lifecycle.ISSUED_NOT_ACTIVATED"},
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#lifecycle.ACTIVE": {kind: "supplement", key: "source:06 Development/react-app/src/components/VisaCabinet.tsx#lifecycle.ACTIVE"},
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#lifecycle.EXPIRING": {kind: "supplement", key: "source:06 Development/react-app/src/components/VisaCabinet.tsx#lifecycle.EXPIRING"},
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#lifecycle.EXTENSION_PROCESSING": {kind: "supplement", key: "source:06 Development/react-app/src/components/VisaCabinet.tsx#lifecycle.EXTENSION_PROCESSING"},
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#lifecycle.EXTENDED": {kind: "supplement", key: "source:06 Development/react-app/src/components/VisaCabinet.tsx#lifecycle.EXTENDED"},
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#lifecycle.EXPIRED": {kind: "supplement", key: "source:06 Development/react-app/src/components/VisaCabinet.tsx#lifecycle.EXPIRED"},
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#lifecycle.CANCELLED": {kind: "supplement", key: "source:06 Development/react-app/src/components/VisaCabinet.tsx#lifecycle.CANCELLED"},
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#lifecycle.REFUSED": {kind: "supplement", key: "source:06 Development/react-app/src/components/VisaCabinet.tsx#lifecycle.REFUSED"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#service.CLIENT_REQUESTED": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#service.CLIENT_REQUESTED"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#service.PURCHASED": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#service.PURCHASED"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#service.WAITING_PAYMENT": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#service.WAITING_PAYMENT"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#service.PAID": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#service.PAID"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#service.DOCUMENTS_REQUIRED": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#service.DOCUMENTS_REQUIRED"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#service.DOCUMENTS_RECEIVED": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#service.DOCUMENTS_RECEIVED"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#service.UNDER_REVIEW": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#service.UNDER_REVIEW"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#service.REVISION_REQUIRED": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#service.REVISION_REQUIRED"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#service.READY_TO_SUBMIT": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#service.READY_TO_SUBMIT"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#service.SUBMITTED": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#service.SUBMITTED"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#service.PROCESSING": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#service.PROCESSING"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#service.ACTION_REQUIRED": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#service.ACTION_REQUIRED"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#service.DELIVERED": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#service.DELIVERED"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#service.COMPLETED": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#service.COMPLETED"},
  "source:06 Development/shared/content/visa-workflow-statuses.v1.json#service.CANCELLED": {kind: "supplement", key: "source:06 Development/shared/content/visa-workflow-statuses.v1.json#service.CANCELLED"},
  "source:06 Development/react-app/src/components/visaDatePresentation.ts#dates.permittedStayUntil": {kind: "supplement", key: "source:06 Development/react-app/src/components/visaDatePresentation.ts#dates.permittedStayUntil"},
  "source:06 Development/react-app/src/components/visaDatePresentation.ts#dates.enterBy": {kind: "supplement", key: "source:06 Development/react-app/src/components/visaDatePresentation.ts#dates.enterBy"},
  "source:06 Development/react-app/src/components/visaDatePresentation.ts#dates.estimatedStayUntil": {kind: "supplement", key: "source:06 Development/react-app/src/components/visaDatePresentation.ts#dates.estimatedStayUntil"},
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#dates.recommendedContact": {kind: "supplement", key: "source:06 Development/react-app/src/components/VisaCabinet.tsx#dates.recommendedContact"},
  "source:06 Development/react-app/src/components/VisaStatusHelp.tsx#help.visa.NOT_ISSUED": {kind: "supplement", key: "source:06 Development/react-app/src/components/VisaStatusHelp.tsx#help.visa.NOT_ISSUED"},
  "source:06 Development/react-app/src/components/VisaStatusHelp.tsx#help.visa.ISSUED_NOT_ACTIVATED": {kind: "supplement", key: "source:06 Development/react-app/src/components/VisaStatusHelp.tsx#help.visa.ISSUED_NOT_ACTIVATED"},
  "source:06 Development/react-app/src/components/VisaStatusHelp.tsx#help.visa.ACTIVE": {kind: "supplement", key: "source:06 Development/react-app/src/components/VisaStatusHelp.tsx#help.visa.ACTIVE"},
  "source:06 Development/react-app/src/components/VisaStatusHelp.tsx#help.visa.EXPIRING": {kind: "supplement", key: "source:06 Development/react-app/src/components/VisaStatusHelp.tsx#help.visa.EXPIRING"},
  "source:06 Development/react-app/src/components/VisaStatusHelp.tsx#help.visa.EXTENSION_PROCESSING": {kind: "supplement", key: "source:06 Development/react-app/src/components/VisaStatusHelp.tsx#help.visa.EXTENSION_PROCESSING"},
  "source:06 Development/react-app/src/components/VisaStatusHelp.tsx#help.visa.EXTENDED": {kind: "supplement", key: "source:06 Development/react-app/src/components/VisaStatusHelp.tsx#help.visa.EXTENDED"},
  "source:06 Development/react-app/src/components/VisaStatusHelp.tsx#help.visa.EXPIRED": {kind: "supplement", key: "source:06 Development/react-app/src/components/VisaStatusHelp.tsx#help.visa.EXPIRED"},
  "source:06 Development/react-app/src/components/VisaStatusHelp.tsx#help.visa.CANCELLED": {kind: "supplement", key: "source:06 Development/react-app/src/components/VisaStatusHelp.tsx#help.visa.CANCELLED"},
  "source:06 Development/react-app/src/components/VisaStatusHelp.tsx#help.visa.REFUSED": {kind: "supplement", key: "source:06 Development/react-app/src/components/VisaStatusHelp.tsx#help.visa.REFUSED"},
  "source:06 Development/react-app/src/components/VisaStatusHelp.tsx#help.visa.ISSUED": {kind: "supplement", key: "source:06 Development/react-app/src/components/VisaStatusHelp.tsx#help.visa.ISSUED"},
  "source:06 Development/react-app/src/components/VisaStatusHelp.tsx#help.aria": {kind: "template", key: "source:06 Development/react-app/src/components/VisaStatusHelp.tsx#help.aria"},
  "source:06 Development/react-app/src/components/VisaStatusHelp.tsx#help.disclaimer": {kind: "supplement", key: "source:06 Development/react-app/src/components/VisaStatusHelp.tsx#help.disclaimer"},
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.eyebrow": {kind: "supplement", key: "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.eyebrow"},
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.save": {kind: "supplement", key: "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.save"},
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.unknown": {kind: "supplement", key: "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.unknown"},
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.enabled": {kind: "supplement", key: "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.enabled"},
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.disabled": {kind: "supplement", key: "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.disabled"},
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.indonesia": {kind: "supplement", key: "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.indonesia"},
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.pending": {kind: "supplement", key: "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.pending"},
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.saved": {kind: "supplement", key: "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.saved"},
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.failed": {kind: "supplement", key: "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.failed"},
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.openDocument": {kind: "supplement", key: "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.openDocument"},
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.intro": {kind: "supplement", key: "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.intro"},
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.price": {kind: "supplement", key: "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.price"},
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.period": {kind: "supplement", key: "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.period"},
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.month": {kind: "supplement", key: "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.month"},
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.day": {kind: "supplement", key: "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.day"},
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.policy": {kind: "supplement", key: "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.policy"},
  "life.urgency.urgent": {kind: "supplement", key: "life.urgency.urgent"},
  "life.urgency.soon": {kind: "supplement", key: "life.urgency.soon"},
  "life.fxApproximationTooltip": {kind: "supplement", key: "life.fxApproximationTooltip"},
  "inline:06 Development/react-app/src/components/BaliLifeCabinet.tsx#0720c7cd5e00": {
    "kind": "runtime",
    "key": "inline:06 Development/react-app/src/components/BaliLifeCabinet.tsx#0720c7cd5e00"
  },
  "inline:06 Development/react-app/src/components/BaliLifeCabinet.tsx#0e9a80e83bff": {
    "kind": "runtime",
    "key": "inline:06 Development/react-app/src/components/BaliLifeCabinet.tsx#0e9a80e83bff"
  },
  "inline:06 Development/react-app/src/components/BaliLifeCabinet.tsx#38f02bc282e7": {
    "kind": "runtime",
    "key": "inline:06 Development/react-app/src/components/BaliLifeCabinet.tsx#38f02bc282e7"
  },
  "inline:06 Development/react-app/src/components/BaliLifeCabinet.tsx#73a321f722ea": {
    "kind": "runtime",
    "key": "inline:06 Development/react-app/src/components/BaliLifeCabinet.tsx#73a321f722ea"
  },
  "inline:06 Development/react-app/src/components/BaliLifeCabinet.tsx#7595ff2569e7": {
    "kind": "runtime",
    "key": "inline:06 Development/react-app/src/components/BaliLifeCabinet.tsx#7595ff2569e7"
  },
  "inline:06 Development/react-app/src/components/BaliLifeCabinet.tsx#800354722682": {
    "kind": "runtime",
    "key": "inline:06 Development/react-app/src/components/BaliLifeCabinet.tsx#800354722682"
  },
  "inline:06 Development/react-app/src/components/BaliLifeCabinet.tsx#ff799de8162e": {
    "kind": "runtime",
    "key": "inline:06 Development/react-app/src/components/BaliLifeCabinet.tsx#ff799de8162e"
  },
  "inline:06 Development/react-app/src/components/LifeReminderPreference.tsx#12856f5cde25": {
    "kind": "runtime",
    "key": "inline:06 Development/react-app/src/components/LifeReminderPreference.tsx#12856f5cde25"
  },
  "inline:06 Development/react-app/src/components/LifeReminderPreference.tsx#19b1746a0623": {
    "kind": "runtime",
    "key": "inline:06 Development/react-app/src/components/LifeReminderPreference.tsx#19b1746a0623"
  },
  "inline:06 Development/react-app/src/components/LifeReminderPreference.tsx#20d4dd2aa195": {
    "kind": "runtime",
    "key": "inline:06 Development/react-app/src/components/LifeReminderPreference.tsx#20d4dd2aa195"
  },
  "inline:06 Development/react-app/src/components/LifeReminderPreference.tsx#7dd2c3fd6900": {
    "kind": "runtime",
    "key": "inline:06 Development/react-app/src/components/LifeReminderPreference.tsx#7dd2c3fd6900"
  },
  "inline:06 Development/react-app/src/components/LifeReminderPreference.tsx#88f02f01257c": {
    "kind": "runtime",
    "key": "inline:06 Development/react-app/src/components/LifeReminderPreference.tsx#88f02f01257c"
  },
  "inline:06 Development/react-app/src/components/LifeReminderPreference.tsx#98d3cdd891fd": {
    "kind": "runtime",
    "key": "inline:06 Development/react-app/src/components/LifeReminderPreference.tsx#98d3cdd891fd"
  },
  "inline:06 Development/react-app/src/components/lifeServices.ts#98dc8b09d5a0": {
    "kind": "runtime",
    "key": "inline:06 Development/react-app/src/components/lifeServices.ts#98dc8b09d5a0"
  },
  "inline:06 Development/react-app/src/components/lifeServices.ts#b592fe33e88f": {
    "kind": "runtime",
    "key": "inline:06 Development/react-app/src/components/lifeServices.ts#b592fe33e88f"
  },
  "inline:06 Development/react-app/src/components/lifeServices.ts#f834793c5945": {
    "kind": "runtime",
    "key": "inline:06 Development/react-app/src/components/lifeServices.ts#f834793c5945"
  },
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.action": {
    "kind": "supplement",
    "key": "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.action"
  },
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.back": {
    "kind": "supplement",
    "key": "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.back"
  },
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.documentFallback": {
    "kind": "supplement",
    "key": "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.documentFallback"
  },
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.documents": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.documents"
  },
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.empty": {
    "kind": "supplement",
    "key": "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.empty"
  },
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.entry": {
    "kind": "supplement",
    "key": "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.entry"
  },
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.entryDate": {
    "kind": "supplement",
    "key": "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.entryDate"
  },
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.eventFallback": {
    "kind": "supplement",
    "key": "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.eventFallback"
  },
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.history": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.history",
    "legacy": {
      "ru": "История",
      "en": "Timeline"
    }
  },
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.important": {
    "kind": "supplement",
    "key": "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.important"
  },
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.intro": {
    "kind": "supplement",
    "key": "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.intro"
  },
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.lifecycle": {
    "kind": "supplement",
    "key": "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.lifecycle"
  },
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.noAction": {
    "kind": "supplement",
    "key": "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.noAction"
  },
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.notifications": {
    "kind": "supplement",
    "key": "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.notifications"
  },
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.open": {
    "kind": "supplement",
    "key": "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.open"
  },
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.process": {
    "kind": "supplement",
    "key": "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.process"
  },
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.retry": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.retry"
  },
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.service": {
    "kind": "supplement",
    "key": "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.service"
  },
  "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.title": {
    "kind": "supplement",
    "key": "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.title"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.all": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.all"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.back": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.back"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.bike": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.bike"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.bikeEnd": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.bikeEnd"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.bikeStart": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.bikeStart"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.bikeToday": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.bikeToday"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.close": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.close"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.contact": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.contact"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.current": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.current"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.currentLabel": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.currentLabel"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.dateZone": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.dateZone"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.details": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.details"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.empty": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.empty"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.emptyCategory": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.emptyCategory"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.end": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.end"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.endOnly": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.endOnly"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.ended": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.ended"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.error": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.error"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.future": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.future"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.history": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.history"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.housing": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.housing"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.housingEnd": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.housingEnd"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.housingStart": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.housingStart"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.housingToday": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.housingToday"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.insurance": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.insurance"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.link": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.link"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.loading": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.loading"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.manager": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.manager"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.noStart": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.noStart"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.other": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.other"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.refresh": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.refresh"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.refreshing": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.refreshing"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.retry": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.retry"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.session": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.session"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.start": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.start"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.title": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.title"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.today": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.today"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.unknown": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.unknown"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.upcoming": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.upcoming"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.visa": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.visa"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.visaOpen": {
    "kind": "journey",
    "key": "planner.openRequests",
    "legacy": {
      "ru": "Открыть визы",
      "en": "Open visas"
    }
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#lifeCopy.visaStatus": {
    "kind": "supplement",
    "key": "source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.lifecycle"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#names.apartment": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#names.apartment"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#names.guesthouse": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#names.guesthouse"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#names.hotel": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#names.hotel"
  },
  "source:06 Development/react-app/src/components/lifeServices.ts#names.villa": {
    "kind": "runtime",
    "key": "source:06 Development/react-app/src/components/lifeServices.ts#names.villa"
  }
} as const;
export type ClientVisaLifeKey = keyof NonNullable<typeof fields>;
export const CLIENT_VISA_LIFE_KEYS = YOGA_MINI_APP?Object.freeze([] as ClientVisaLifeKey[]):Object.freeze(Object.keys(fields!) as ClientVisaLifeKey[]);

export function clientVisaLifeText(value:ClientUiBindings,key:ClientVisaLifeKey,variables?:ClientRuntimeVariables):string{
 if(!fields||!entries)throw new Error('CLIENT_VISA_LIFE_MAIN_BUILD_ONLY');
 const ui=requireClientUiBindings(value);
 if(typeof key!=='string'||!Object.hasOwn(fields,key))throw new Error('CLIENT_VISA_LIFE_SOURCE_GAP');
 const slot=fields[key];
 // Semantic aliases reuse accepted foreign copy, but retain the target's exact
 // historical RU/EN (Timeline vs History; Open visas vs Open my visas).
 if('legacy' in slot&&(ui.locale==='ru'||ui.locale==='en')){
  if(variables!==undefined)throw new Error('CLIENT_VISA_LIFE_STATIC_VARIABLES');
  return slot.legacy[ui.locale];
 }
 if(slot.kind==='runtime')return ui.text(slot.key,variables);
 if(slot.kind==='template'){
  const template=entries[slot.key][ui.locale];
  if(variables===undefined)return template;
  if(variables===null||typeof variables!=='object'||
   ![Object.prototype,null].includes(Object.getPrototypeOf(variables))||
   Object.getOwnPropertySymbols(variables).length)throw new Error('CLIENT_VISA_LIFE_VARIABLES_TYPE');
  const descriptors=Object.getOwnPropertyDescriptors(variables);
  if(Object.keys(descriptors).length!==1||!Object.hasOwn(descriptors,'code'))throw new Error('CLIENT_VISA_LIFE_VARIABLE_IDENTITY');
  const descriptor=descriptors.code;
  if(!('value' in descriptor)||(typeof descriptor.value!=='string'&&
   !(typeof descriptor.value==='number'&&Number.isFinite(descriptor.value))))throw new Error('CLIENT_VISA_LIFE_VARIABLE_VALUE');
  return template.replace(/\{code\}/g,()=>String(descriptor.value));
 }
 if(variables!==undefined)throw new Error('CLIENT_VISA_LIFE_STATIC_VARIABLES');
 return slot.kind==='journey'?clientJourneyText(ui,slot.key):entries[slot.key][ui.locale];
}

