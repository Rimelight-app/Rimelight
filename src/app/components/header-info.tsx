import { Link } from 'react-router-dom'

type TextBadge = {
  content: string | null
  type: 'text'
}

type LinkBadge = {
  content: string | null
  type: 'link'
  link: string
}

export type BadgesData = Array<TextBadge | LinkBadge>

interface HeaderInfoProps {
  /** Kept for API compatibility; chips need no separators. */
  showFirstDot?: boolean
  badges: BadgesData
}

const chip =
  'glass-chip inline-flex h-6 items-center rounded-md px-2 text-[12px] font-medium text-white/75'

/** Small frosted info chips (year, genre, track count, duration). */
export function HeaderInfoGenerator({ badges }: HeaderInfoProps) {
  const items = badges.filter((item) => item.content)
  if (items.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((item, index) =>
        item.type === 'link' ? (
          <Link
            key={index}
            to={item.link}
            className={`${chip} transition-colors hover:text-white hover:bg-white/[0.14]`}
          >
            {item.content}
          </Link>
        ) : (
          <span key={index} className={chip}>
            {item.content}
          </span>
        ),
      )}
    </div>
  )
}
