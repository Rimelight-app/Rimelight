import { Pause, Play } from 'lucide-react'
import React, { ComponentPropsWithoutRef } from 'react'
import { LazyLoadImage } from 'react-lazy-load-image-component'
import { Link } from 'react-router-dom'
import { Button } from '@/app/components/ui/button'
import { cn } from '@/lib/utils'

interface Children {
  children: React.ReactNode
}

type RootProps = ComponentPropsWithoutRef<'div'>

function Root({ className, children, ...props }: RootProps) {
  return (
    <div className={cn('cursor-pointer', className)} {...props}>
      {children}
    </div>
  )
}

interface ImageWrapperProps extends Children {
  link: string
}

function ImageWrapper({ children, link }: ImageWrapperProps) {
  return (
    <div className="group flex-1 aspect-square rounded-2xl bg-white/5 ring-1 ring-white/[0.06] relative overflow-hidden shadow-[0_16px_36px_-18px_rgb(0_0_0/0.7)] transition-transform duration-300 ease-out hover:-translate-y-0.5">
      <Link
        to={link}
        data-testid="card-image-link"
        className="flex h-full w-full"
      >
        {children}
      </Link>
    </div>
  )
}

interface ImageProps {
  src?: string
  alt: string
}

function Image({ src, alt }: ImageProps) {
  return (
    <LazyLoadImage
      src={src}
      alt={alt}
      effect="opacity"
      width="100%"
      height="100%"
      className="aspect-square object-cover w-full h-full absolute inset-0 z-0"
      data-testid="card-image"
    />
  )
}

type CardButtonProps = ComponentPropsWithoutRef<'button'> & {
  onClick: () => void
  dataTestId: string
}

function CardButton({ onClick, dataTestId, children }: CardButtonProps) {
  return (
    <div className="w-full h-full flex items-end justify-end p-3 rounded-2xl bg-gradient-to-t from-black/0 to-transparent group-hover:from-black/45 transition-all duration-300 absolute inset-0 z-10">
      <Button
        className="opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 rounded-full size-11 z-20 bg-white/95 text-[#121216] hover:bg-white shadow-[0_10px_24px_-8px_rgb(0_0_0/0.6)]"
        variant="default"
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          onClick()
        }}
        data-testid={dataTestId}
      >
        {children}
      </Button>
    </div>
  )
}

interface PlayPauseButtonProps {
  onClick: () => void
}

function PlayButton({ onClick }: PlayPauseButtonProps) {
  return (
    <CardButton dataTestId="card-play-button" onClick={onClick}>
      <Play className="size-4 fill-current" strokeWidth={2.5} />
    </CardButton>
  )
}

function PauseButton({ onClick }: PlayPauseButtonProps) {
  return (
    <CardButton dataTestId="card-pause-button" onClick={onClick}>
      <Pause className="size-4 fill-current" strokeWidth={2.5} />
    </CardButton>
  )
}

interface InfoWrapperProps extends Children {}

function InfoWrapper({ children }: InfoWrapperProps) {
  return <div className="flex flex-col cursor-default">{children}</div>
}

interface TitleProps {
  link: string
  className?: string
  children: string
}

function Title({ link, children, className }: TitleProps) {
  return (
    <div className="w-full truncate mt-0.5" data-testid="card-title">
      <Link
        to={link}
        className={cn(
          'max-w-full truncate hover:underline leading-7 text-sm font-semibold',
          className,
        )}
        data-testid="card-title-link"
      >
        {children}
      </Link>
    </div>
  )
}

interface SubtitleProps {
  link?: string
  children: React.ReactNode
  enableLink?: boolean
  className?: string
}

function Subtitle({
  link,
  children,
  enableLink = true,
  className,
}: SubtitleProps) {
  if (!enableLink || !link) {
    return (
      <div className="w-full">
        <p
          className={cn(
            'leading-5 truncate text-xs text-muted-foreground -mt-0.5',
            className,
          )}
          data-testid="card-subtitle"
        >
          {children}
        </p>
      </div>
    )
  }

  return (
    <div className="flex w-full truncate -mt-0.5" data-testid="card-subtitle">
      <Link
        to={link}
        data-testid="card-subtitle-link"
        className={cn(
          'max-w-full truncate text-xs text-muted-foreground hover:underline',
          className,
        )}
      >
        {children}
      </Link>
    </div>
  )
}

export const PreviewCard = {
  Root,
  ImageWrapper,
  Image,
  PlayButton,
  InfoWrapper,
  Title,
  Subtitle,
  PauseButton,
}
