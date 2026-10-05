// Current approved proxy policy: image posters and opt-in privacy-enhanced
// YouTube frames are the only allowed third-party origins. No unsafe-inline.
export const productionCsp = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://i.ytimg.com; font-src 'self'; connect-src 'self'; frame-src https://www.youtube-nocookie.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
