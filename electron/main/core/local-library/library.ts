import { promises as fs } from 'node:fs'
import path from 'node:path'
import { hashId, LocalTrack, scanFolders } from './scanner'

/** What the user did with the library: likes, ratings, plays, playlists. */
interface UserData {
  starred: Record<string, string>
  ratings: Record<string, number>
  plays: Record<string, { count: number; last: string }>
  playlists: LocalPlaylist[]
  playQueue: {
    ids: string[]
    current?: string
    position: number
    changed: string
  } | null
  radios: {
    id: string
    name: string
    streamUrl: string
    homePageUrl?: string
  }[]
}

interface LocalPlaylist {
  id: string
  name: string
  comment?: string
  public: boolean
  songIds: string[]
  created: string
  changed: string
}

export interface LocalAlbum {
  id: string
  name: string
  artist: string
  artistId: string
  year?: number
  genres: string[]
  tracks: LocalTrack[]
  created: number
}

export interface LocalArtist {
  id: string
  name: string
  albums: LocalAlbum[]
}

const emptyUserData = (): UserData => ({
  starred: {},
  ratings: {},
  plays: {},
  playlists: [],
  playQueue: null,
  radios: [],
})

const albumKey = (t: LocalTrack) =>
  `${t.albumArtist.toLowerCase()}\u0000${t.album.toLowerCase()}`

/**
 * The local library: tracks from the scanned folders, grouped into albums and
 * artists, plus the user's likes, ratings, plays and playlists. Saved as two
 * JSON files in the app's data folder.
 */
export class Library {
  tracks = new Map<string, LocalTrack>()
  albums = new Map<string, LocalAlbum>()
  artists = new Map<string, LocalArtist>()
  /** Artist id for every name that appears on a track (incl. featured). */
  artistIdByName = new Map<string, string>()
  user: UserData = emptyUserData()
  scanning = false
  scanned = 0
  private saveTimer: NodeJS.Timeout | null = null

  constructor(private dir: string) {}

  private get indexFile() {
    return path.join(this.dir, 'index.json')
  }

  private get userFile() {
    return path.join(this.dir, 'user.json')
  }

  async load() {
    await fs.mkdir(this.dir, { recursive: true })
    try {
      const raw = JSON.parse(await fs.readFile(this.indexFile, 'utf8'))
      this.setTracks(raw.tracks ?? [])
    } catch {
      this.setTracks([])
    }
    try {
      this.user = {
        ...emptyUserData(),
        ...JSON.parse(await fs.readFile(this.userFile, 'utf8')),
      }
    } catch {
      this.user = emptyUserData()
    }
  }

  async scan(folders: string[]) {
    if (this.scanning) return
    this.scanning = true
    this.scanned = 0
    try {
      const byPath = new Map([...this.tracks.values()].map((t) => [t.path, t]))
      const tracks = await scanFolders(folders, byPath, (done) => {
        this.scanned = done
      })
      this.setTracks(tracks)
      await writeJson(this.indexFile, { version: 1, tracks })
    } finally {
      this.scanning = false
    }
  }

  private setTracks(list: LocalTrack[]) {
    this.tracks = new Map(list.map((t) => [t.id, t]))
    this.albums = new Map()
    this.artists = new Map()
    this.artistIdByName = new Map()

    const artistFor = (name: string) => {
      const id = hashId('ar', name.toLowerCase())
      this.artistIdByName.set(name.toLowerCase(), id)
      let artist = this.artists.get(id)
      if (!artist) {
        artist = { id, name, albums: [] }
        this.artists.set(id, artist)
      }
      return artist
    }

    const byKey = new Map<string, LocalAlbum>()
    for (const t of list) {
      for (const name of t.artists) artistFor(name)
      const key = albumKey(t)
      let album = byKey.get(key)
      if (!album) {
        const artist = artistFor(t.albumArtist)
        album = {
          id: hashId('al', key),
          name: t.album,
          artist: t.albumArtist,
          artistId: artist.id,
          year: t.year,
          genres: [],
          tracks: [],
          created: t.addedAt,
        }
        byKey.set(key, album)
        this.albums.set(album.id, album)
        artist.albums.push(album)
      }
      album.tracks.push(t)
      album.year ??= t.year
      album.created = Math.min(album.created, t.addedAt)
      for (const g of t.genres)
        if (!album.genres.includes(g)) album.genres.push(g)
    }
    for (const album of this.albums.values()) {
      album.tracks.sort(
        (a, b) =>
          (a.disc ?? 1) - (b.disc ?? 1) ||
          (a.track ?? 0) - (b.track ?? 0) ||
          a.title.localeCompare(b.title),
      )
    }
    // Artists that only appear as featured guests have no albums of their
    // own; keep them for links but they are not listed.
  }

  albumOf(t: LocalTrack) {
    return this.albums.get(hashId('al', albumKey(t)))
  }

  /** Persists user data a moment after the last change. */
  saveUser() {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      writeJson(this.userFile, this.user).catch(() => undefined)
    }, 400)
  }

  async flush() {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    await writeJson(this.userFile, this.user)
  }

  // ---- Subsonic-shaped objects ----

  song(t: LocalTrack) {
    const album = this.albumOf(t)
    const played = this.user.plays[t.id]
    const relative = path.relative(t.folder, t.path)
    return {
      id: t.id,
      parent: album?.id,
      isDir: false,
      title: t.title,
      album: t.album,
      artist: t.artist,
      track: t.track,
      discNumber: t.disc,
      year: t.year,
      genre: t.genres[0],
      genres: t.genres.map((name) => ({ name })),
      coverArt: album?.id ?? t.id,
      size: t.size,
      contentType: contentType(t.suffix),
      suffix: t.suffix,
      duration: t.duration,
      bitRate: t.bitRate,
      samplingRate: t.sampleRate,
      bitDepth: t.bitDepth,
      channelCount: t.channels,
      path: relative,
      created: new Date(t.addedAt).toISOString(),
      albumId: album?.id,
      artistId: this.artistIdByName.get(t.artists[0].toLowerCase()),
      artists: t.artists.map((name) => ({
        id: this.artistIdByName.get(name.toLowerCase()),
        name,
      })),
      albumArtists: album ? [{ id: album.artistId, name: album.artist }] : [],
      displayArtist: t.artist,
      displayAlbumArtist: album?.artist,
      type: 'music',
      mediaType: 'song',
      playCount: played?.count ?? 0,
      played: played?.last,
      starred: this.user.starred[t.id],
      userRating: this.user.ratings[t.id],
      replayGain: t.replayGain,
    }
  }

  album(a: LocalAlbum, withSongs = false) {
    const played = a.tracks
      .map((t) => this.user.plays[t.id])
      .filter(Boolean) as { count: number; last: string }[]
    return {
      id: a.id,
      name: a.name,
      title: a.name,
      album: a.name,
      artist: a.artist,
      artistId: a.artistId,
      artists: [{ id: a.artistId, name: a.artist }],
      coverArt: a.id,
      songCount: a.tracks.length,
      duration: a.tracks.reduce((s, t) => s + t.duration, 0),
      created: new Date(a.created).toISOString(),
      year: a.year,
      genre: a.genres[0],
      genres: a.genres.map((name) => ({ name })),
      isDir: true,
      starred: this.user.starred[a.id],
      userRating: this.user.ratings[a.id],
      playCount: played.reduce((s, p) => s + p.count, 0),
      played: played
        .map((p) => p.last)
        .sort()
        .at(-1),
      ...(withSongs ? { song: a.tracks.map((t) => this.song(t)) } : {}),
    }
  }

  artist(a: LocalArtist, withAlbums = false) {
    return {
      id: a.id,
      name: a.name,
      albumCount: a.albums.length,
      coverArt: a.albums[0]?.id,
      starred: this.user.starred[a.id],
      ...(withAlbums ? { album: a.albums.map((al) => this.album(al)) } : {}),
    }
  }

  playlist(p: LocalPlaylist, withSongs = false) {
    const tracks = p.songIds
      .map((id) => this.tracks.get(id))
      .filter(Boolean) as LocalTrack[]
    return {
      id: p.id,
      name: p.name,
      comment: p.comment,
      owner: 'clearplay',
      public: p.public,
      songCount: tracks.length,
      duration: tracks.reduce((s, t) => s + t.duration, 0),
      created: p.created,
      changed: p.changed,
      coverArt: tracks[0] ? this.albumOf(tracks[0])?.id : undefined,
      ...(withSongs ? { entry: tracks.map((t) => this.song(t)) } : {}),
    }
  }
}

export function contentType(suffix: string) {
  const map: Record<string, string> = {
    mp3: 'audio/mpeg',
    flac: 'audio/flac',
    ogg: 'audio/ogg',
    oga: 'audio/ogg',
    opus: 'audio/ogg',
    m4a: 'audio/mp4',
    mp4: 'audio/mp4',
    aac: 'audio/aac',
    wav: 'audio/wav',
    aif: 'audio/aiff',
    aiff: 'audio/aiff',
    webm: 'audio/webm',
    wma: 'audio/x-ms-wma',
    ape: 'audio/x-ape',
    wv: 'audio/x-wavpack',
  }
  return map[suffix] ?? 'application/octet-stream'
}

async function writeJson(file: string, data: unknown) {
  const tmp = `${file}.tmp`
  await fs.writeFile(tmp, JSON.stringify(data))
  await fs.rename(tmp, file)
}
