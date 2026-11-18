import Autoplay from 'embla-carousel-autoplay'
import { HeaderFallback } from '@/app/components/fallbacks/home-fallbacks'
import { HeaderItem } from '@/app/components/home/carousel/header-item'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/app/components/ui/carousel'
import { useGetRandomSongs } from '@/app/hooks/use-home'
import { useAppStore } from '@/store/app.store'

export function HomeHeader() {
  const { data: songs, isLoading, isFetching } = useGetRandomSongs()
  const autoScrollEnabled = useAppStore().pages.homeAutoScrollEnabled
  const loopEnabled = useAppStore().pages.homeLoopEnabled

  if (isLoading || isFetching) return <HeaderFallback />
  if (!songs || songs.length === 0) return null

  return (
    <div className="px-8 pt-6">
      <Carousel
        className="glass-panel w-full overflow-hidden z-10 rounded-[24px]"
        opts={{
          loop: loopEnabled,
        }}
        plugins={[
          Autoplay({
            delay: 10000,
            active: autoScrollEnabled,
          }),
        ]}
        data-testid="header-carousel"
      >
        <CarouselContent className="ml-0 flex">
          {songs.map((song, index) => (
            <CarouselItem
              key={song.id}
              className="pl-0 basis-full maskImage-carousel-item transform-gpu"
              data-testid={`carousel-header-song-${index}`}
            >
              <HeaderItem song={song} />
            </CarouselItem>
          ))}
        </CarouselContent>
        <div className="absolute right-5 bottom-5 z-20 flex items-center gap-2">
          <CarouselPrevious
            data-testid="header-carousel-previous"
            className="glass-chip relative inset-0 translate-x-0 translate-y-0 size-8 rounded-full border-white/10 text-white/80 hover:bg-white/[0.14] hover:text-white"
          />
          <CarouselNext
            data-testid="header-carousel-next"
            className="glass-chip relative inset-0 translate-x-0 translate-y-0 size-8 rounded-full border-white/10 text-white/80 hover:bg-white/[0.14] hover:text-white"
          />
        </div>
      </Carousel>
    </div>
  )
}
