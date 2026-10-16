/**
 * Mask email addresses embedded in credential display names.
 *
 * `claude-test@proud.gg.json` → `claude-t•••@p•••.gg.json`: the local part and
 * the first domain segment keep their first character, everything after the
 * first domain dot (TLD chain, `.json` suffix) stays readable so files remain
 * distinguishable by provider/extension while the identifying halves are
 * hidden. Pure and React-free for direct bun:test consumption.
 */

/* The local part deliberately excludes `-`: credential filenames are
 * `<provider>-<email>.json`, so a hyphen-greedy match would swallow the
 * provider prefix (`claude-test@…` must mask to `claude-t•••@…`, not `c•••@…`).
 * ponytail: hyphenated email locals keep their last token visible — fine for a
 * display mask, revisit only if real credentials hit it. */
const EMAIL_RE = /([A-Za-z0-9._%+]+)@([A-Za-z0-9-]+)((?:\.[A-Za-z0-9-]+)*)/g;

const MASK = '•••';

const maskSegment = (segment: string): string => `${segment.slice(0, 1)}${MASK}`;

export function maskEmailsInText(text: string): string {
  return text.replace(
    EMAIL_RE,
    (_match, local: string, domainHead: string, domainRest: string) =>
      `${maskSegment(local)}@${maskSegment(domainHead)}${domainRest}`
  );
}
