/** What HTML would read as markup, and how it is written as text instead. */
const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}
/** Whitespace within a line (`[^\S\n]`: any whitespace but a line break). */
const BLANKS = String.raw`[^\S\n]*`
/** A blank line, and any further ones: where one paragraph ends and the next begins. */
const PARAGRAPH_BREAK = new RegExp(String.raw`\n${BLANKS}\n\s*`)
/** A single line break, with the spaces around it. */
const LINE_BREAK = new RegExp(String.raw`${BLANKS}\n${BLANKS}`, 'g')

/**
 * Plain text from the composer as the HTML that Graph's `reply` and `forward`
 * actions take as `comment`: escaped, paragraphs (separated by blank lines) as
 * `<p>`, single line breaks as `<br>`. Empty text gives an empty comment.
 */
function commentHtml(text: string): string {
  return text
    .replaceAll(/\r\n?/g, '\n')
    .split(PARAGRAPH_BREAK)
    .map(paragraph => paragraph.trim())
    .filter(paragraph => paragraph.length > 0)
    .map(paragraph => {
      const escaped = paragraph.replaceAll(/[&<>"']/g, character => ESCAPES[character] ?? character)
      return `<p>${escaped.replaceAll(LINE_BREAK, '<br>')}</p>`
    })
    .join('')
}

export default commentHtml
