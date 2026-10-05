// A delayed older HTTP response must not roll back an accepted publication.
// No FX arithmetic or cache/TTL change: the whole authoritative snapshot wins.
export function projectionMayReplace(current,next) {
  if(!current)return true;
  if(Number.isSafeInteger(current.publication_version)&&Number.isSafeInteger(next?.publication_version))
    return next.publication_version>=current.publication_version;
  return true; // Legacy synthetic consumers without a publication field.
}
