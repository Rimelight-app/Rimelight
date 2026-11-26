import { linkifyText } from '@/utils/parseTexts'
import { sanitizeHtml } from '@/utils/sanitize'

export function AlbumComment({ comment }: { comment: string }) {
  // The comment tag comes from the music file: never trusted as HTML.
  const parsedComment = sanitizeHtml(linkifyText(comment))

  return (
    <div className="mt-8 text-sm text-muted-foreground p-4 bg-muted rounded-md border border-border">
      <p
        className="html whitespace-pre-line"
        dangerouslySetInnerHTML={{ __html: parsedComment }}
      />
    </div>
  )
}
