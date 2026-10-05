// Exact Founder-approved presentation delta. Raw editorial sources stay intact.
import {createHash} from "node:crypto";
import approvals from "../../shared/content/registry-presentation-approvals.v1.json" with {type:"json"};

export function approvedPresentationDecision(record, locale, payload, source) {
  const expected = approvals.sourceBindings[record.contentId]?.[locale];
  if (!expected) return {version:null, removeInternalInstructions:false, priceUnit:null, priceUnitNote:null};
  if (expected !== payload.bodySha256 ||
      createHash("sha256").update(source).digest("hex") !== expected) {
    throw new Error("Founder presentation approval drift: " + record.contentId + "/" + locale);
  }
  const perPerson = approvals.e33gPerPersonContentIds.includes(record.contentId);
  return {
    version:approvals.version,
    removeInternalInstructions:locale === "ru" && approvals.c1InstructionContentIds.includes(record.contentId),
    priceUnit:perPerson ? "per_person" : null,
    priceUnitNote:perPerson ? approvals.e33gUnitNotes[locale] : null,
  };
}
export function removeApprovedInternalInstructions(value, omitted, usdMarker = "") {
  // Remove ONLY exact technical instructions, preserving the surrounding
  // customer sentences, authored prices, currency and all raw originals.
  return value
    .replace(/USD-эквивалент должен выводиться существующей системой сайта на основе текущего курса\./g, text => {
      omitted.push(text); return "";
    })
    .replace(/На сайте USD-эквивалент должен выводиться через уже существующую систему курса\./g, text => {
      omitted.push(text); return "";
    })
    .replace(/ \+ динамический USD-эквивалент через существующий Indodax pricing helper/g, text => {
      omitted.push(text); return usdMarker ? " " + usdMarker : "";
    });
}
