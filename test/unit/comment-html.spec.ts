import { describe, expect, it } from 'vite-plus/test'
import commentHtml from '#server/mail/providers/comment-html'

describe('comment html', () => {
  it('turns blank-line paragraphs into <p> and single line breaks into <br>', () => {
    expect(commentHtml('Hi Lena,\n\nThursday works.\nSee you then.\n\nMara')).toBe(
      '<p>Hi Lena,</p><p>Thursday works.<br>See you then.</p><p>Mara</p>',
    )
  })

  it('escapes everything that HTML would read as markup', () => {
    expect(commentHtml(`Costs < 5 & > 2, "quoted" and 'single' <b>bold</b>`)).toBe(
      '<p>Costs &lt; 5 &amp; &gt; 2, &quot;quoted&quot; and &#39;single&#39; &lt;b&gt;bold&lt;/b&gt;</p>',
    )
  })

  it('tolerates Windows line breaks, extra blank lines and stray spaces', () => {
    expect(commentHtml('  First line \r\nsecond\r\n \r\n\r\n\r\nLast  \n\n')).toBe(
      '<p>First line<br>second</p><p>Last</p>',
    )
  })

  it('keeps a Windows line break inside a paragraph as a line break', () => {
    expect(commentHtml('First\r\nSecond')).toBe('<p>First<br>Second</p>')
  })

  it('gives an empty comment for empty text', () => {
    expect([commentHtml(''), commentHtml(' \n\n ')]).toStrictEqual(['', ''])
  })
})
