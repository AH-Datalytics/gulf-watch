/**
 * True only when the NHC public advisory's Hurricane Warning block explicitly
 * names Metropolitan New Orleans. Mentions elsewhere in the bulletin do not
 * qualify, which prevents an unrelated impact paragraph from becoming a
 * location-specific warning claim.
 */
export function nolaHasHurricaneWarning(publicAdvisoryText: string | null | undefined): boolean {
  if (!publicAdvisoryText) return false;
  const text = publicAdvisoryText.replace(/\r/g, "");
  const heading = /(?:^|\n)A Hurricane Warning is in effect for\.\.\.\s*\n/i.exec(text);
  if (!heading) return false;

  const remainder = text.slice(heading.index + heading[0].length);
  const nextHeading = remainder.search(
    /\n\s*A (?:Storm Surge|Hurricane|Tropical Storm) (?:Watch|Warning) is in effect for\.\.\./i
  );
  const warningBlock = (nextHeading >= 0 ? remainder.slice(0, nextHeading) : remainder)
    .replace(/\s+/g, " ");
  return /\bMetropolitan New Orleans\b/i.test(warningBlock);
}
