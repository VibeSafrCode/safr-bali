import { yogaPresentationText } from '../../../shared/src/yoga-presentation.mjs';
import { YOGA_MINI_APP } from '../runtime/yoga-mini-app';

// Static copy at the rendering boundary, never user/API values or auth payloads.
export const presentationCopy = (value: string) => yogaPresentationText(value, YOGA_MINI_APP);
