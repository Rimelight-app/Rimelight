import { createHash, timingSafeEqual } from 'node:crypto'
import { createReadStream, promises as fs } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { nativeImage } from 'electron'
import { parseFile } from 'music-metadata'
import { contentType, Library, LocalAlbum } from './library'
import { hashId, LocalTrack } from './scanner'

export const LOCAL_USER = 'clearplay'
const API_VERSION = '1.16.1'

type Params = URLSearchParams
type Json = Record<string, unknown>

/**
 * A small Subsonic-compatible server for the local library, bound to
 * 127.0.0.1. The app talks to it exactly as it talks to Navidrome, so every
 * page works the same with local folders.
 */
export function createLocalServer(
  library: Library,
  password: () => string,
  rescan: () => void,
) {
  const coverCache = new Map<string, Buffer>()

  function ok(extra: Json = {}): Json {
    return {
      'subsonic-response': {
        status: 'ok',
        version: API_VERSION,
        type: 'clearplay',
        serverVersion: 'local',
        openSubsonic: true,
        ...extra,
      },
    }
  }

  function fail(code: number, message: string): Json {
    return {
      'subsonic-response': {
        status: 'failed',
        version: API_VERSION,
        type: 'clearplay',
        openSubsonic: true,
        error: { code, message },
      },
    }
  }

  function authorised(q: Params) {
    if (q.get('u') !== LOCAL_USER) return false
    const secret = password()
    const t = q.get('t')
    const s = q.get('s')
    if (t && s) {
      return safeEqual(
        createHash('md5')
          .update(secret + s)
          .digest('hex'),
        t,
      )
    }
    let p = q.get('p') ?? ''
    if (p.startsWith('enc:'))
      p = Buffer.from(p.slice(4), 'hex').toString('utf8')
    return safeEqual(p, secret)
  }

  const songs = () => [...library.tracks.values()]
  const albums = () => [...library.albums.values()]
  const num = (q: Params, k: string, d: number) => {
    const v = Number(q.get(k))
    return Number.isFinite(v) && q.get(k) !== null ? v : d
  }
  const page = <T>(
    list: T[],
    q: Params,
    sizeKey: string,
    offKey: string,
    d: number,
  ) =>
    list.slice(
      num(q, offKey, 0),
      num(q, offKey, 0) + Math.min(num(q, sizeKey, d), 5000),
    )

  function shuffle<T>(list: T[]) {
    const a = [...list]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  const matches = (text: string, words: string[]) => {
    const t = text.toLowerCase()
    return words.every((w) => t.includes(w))
  }

  const playCount = (a: LocalAlbum) =>
    a.tracks.reduce((s, t) => s + (library.user.plays[t.id]?.count ?? 0), 0)
  const lastPlayed = (a: LocalAlbum) =>
    a.tracks
      .map((t) => library.user.plays[t.id]?.last ?? '')
      .sort()
      .at(-1) ?? ''

  function idsOf(q: Params, ...keys: string[]) {
    return keys.flatMap((k) => q.getAll(k)).filter(Boolean)
  }

  // ---------------- endpoints ----------------
  const api: Record<string, (q: Params) => Json | Promise<Json>> = {
    ping: () => ok(),
    getLicense: () => ok({ license: { valid: true } }),
    getOpenSubsonicExtensions: () =>
      ok({ openSubsonicExtensions: [{ name: 'songLyrics', versions: [1] }] }),
    getMusicFolders: () =>
      ok({ musicFolders: { musicFolder: [{ id: 1, name: 'Local' }] } }),
    getUser: () =>
      ok({
        user: {
          username: LOCAL_USER,
          adminRole: true,
          streamRole: true,
          downloadRole: true,
          playlistRole: true,
        },
      }),

    getArtists: () => {
      const list = [...library.artists.values()]
        .filter((a) => a.albums.length)
        .sort((a, b) => a.name.localeCompare(b.name))
      const index = new Map<string, Json[]>()
      for (const a of list) {
        const letter = /[a-z]/i.test(a.name[0] ?? '')
          ? a.name[0].toUpperCase()
          : '#'
        index.set(letter, [...(index.get(letter) ?? []), library.artist(a)])
      }
      return ok({
        artists: {
          ignoredArticles: '',
          index: [...index].map(([name, artist]) => ({ name, artist })),
        },
      })
    },
    getArtist: (q) => {
      const a = library.artists.get(q.get('id') ?? '')
      return a
        ? ok({ artist: library.artist(a, true) })
        : fail(70, 'Artist not found')
    },
    getArtistInfo: () => ok({ artistInfo: {} }),
    getArtistInfo2: () => ok({ artistInfo2: {} }),
    getAlbumInfo: () => ok({ albumInfo: {} }),
    getAlbumInfo2: () => ok({ albumInfo: {} }),

    getAlbum: (q) => {
      const a = library.albums.get(q.get('id') ?? '')
      return a
        ? ok({ album: library.album(a, true) })
        : fail(70, 'Album not found')
    },
    getAlbumList2: (q) => list2(q, 'albumList2'),
    getAlbumList: (q) => list2(q, 'albumList'),

    getSong: (q) => {
      const t = library.tracks.get(q.get('id') ?? '')
      return t ? ok({ song: library.song(t) }) : fail(70, 'Song not found')
    },
    getRandomSongs: (q) => {
      let list = songs()
      const genre = q.get('genre')
      if (genre) list = list.filter((t) => t.genres.includes(genre))
      const from = q.get('fromYear')
      const to = q.get('toYear')
      if (from) list = list.filter((t) => (t.year ?? 0) >= Number(from))
      if (to) list = list.filter((t) => (t.year ?? 0) <= Number(to))
      return ok({
        randomSongs: {
          song: shuffle(list)
            .slice(0, Math.min(num(q, 'size', 10), 500))
            .map((t) => library.song(t)),
        },
      })
    },
    getSongsByGenre: (q) => {
      const genre = q.get('genre') ?? ''
      const list = songs().filter((t) => t.genres.includes(genre))
      return ok({
        songsByGenre: {
          song: page(list, q, 'count', 'offset', 10).map((t) =>
            library.song(t),
          ),
        },
      })
    },
    getGenres: () => {
      const counts = new Map<string, { songs: number; albums: Set<string> }>()
      for (const t of songs()) {
        for (const g of t.genres) {
          const c = counts.get(g) ?? { songs: 0, albums: new Set<string>() }
          c.songs++
          c.albums.add(library.albumOf(t)?.id ?? '')
          counts.set(g, c)
        }
      }
      return ok({
        genres: {
          genre: [...counts].map(([value, c]) => ({
            value,
            songCount: c.songs,
            albumCount: c.albums.size,
          })),
        },
      })
    },
    getTopSongs: (q) => {
      const name = (q.get('artist') ?? '').toLowerCase()
      const list = songs()
        .filter((t) => t.artists.some((a) => a.toLowerCase() === name))
        .sort(
          (a, b) =>
            (library.user.plays[b.id]?.count ?? 0) -
            (library.user.plays[a.id]?.count ?? 0),
        )
      return ok({
        topSongs: {
          song: list.slice(0, num(q, 'count', 50)).map((t) => library.song(t)),
        },
      })
    },
    getSimilarSongs: (q) => ok({ similarSongs: { song: similar(q) } }),
    getSimilarSongs2: (q) => ok({ similarSongs2: { song: similar(q) } }),
    getNowPlaying: () => ok({ nowPlaying: {} }),

    search3: (q) => searchResult(q, 'searchResult3'),
    search2: (q) => searchResult(q, 'searchResult2'),

    getStarred2: () => starred('starred2'),
    getStarred: () => starred('starred'),
    star: (q) => {
      const now = new Date().toISOString()
      for (const id of idsOf(q, 'id', 'albumId', 'artistId'))
        library.user.starred[id] = now
      library.saveUser()
      return ok()
    },
    unstar: (q) => {
      for (const id of idsOf(q, 'id', 'albumId', 'artistId'))
        delete library.user.starred[id]
      library.saveUser()
      return ok()
    },
    setRating: (q) => {
      const id = q.get('id') ?? ''
      const rating = Math.max(0, Math.min(5, Math.round(num(q, 'rating', 0))))
      if (rating === 0) delete library.user.ratings[id]
      else library.user.ratings[id] = rating
      library.saveUser()
      return ok()
    },
    scrobble: (q) => {
      if (q.get('submission') === 'false') return ok()
      const times = q.getAll('time')
      q.getAll('id').forEach((id, i) => {
        if (!library.tracks.has(id)) return
        const at = times[i] ? new Date(Number(times[i])) : new Date()
        const prev = library.user.plays[id]
        library.user.plays[id] = {
          count: (prev?.count ?? 0) + 1,
          last: at.toISOString(),
        }
      })
      library.saveUser()
      return ok()
    },

    getPlaylists: () =>
      ok({
        playlists: {
          playlist: library.user.playlists.map((p) => library.playlist(p)),
        },
      }),
    getPlaylist: (q) => {
      const p = library.user.playlists.find((x) => x.id === q.get('id'))
      return p
        ? ok({ playlist: library.playlist(p, true) })
        : fail(70, 'Playlist not found')
    },
    createPlaylist: (q) => {
      const now = new Date().toISOString()
      const existing = library.user.playlists.find(
        (x) => x.id === q.get('playlistId'),
      )
      const songIds = q.getAll('songId')
      if (existing) {
        existing.songIds = songIds
        existing.changed = now
        if (q.get('name')) existing.name = q.get('name') as string
        library.saveUser()
        return ok({ playlist: library.playlist(existing, true) })
      }
      const p = {
        id: hashId('pl', `${now}${Math.random()}`),
        name: q.get('name') || 'Playlist',
        public: false,
        songIds,
        created: now,
        changed: now,
      }
      library.user.playlists.push(p)
      library.saveUser()
      return ok({ playlist: library.playlist(p, true) })
    },
    updatePlaylist: (q) => {
      const p = library.user.playlists.find((x) => x.id === q.get('playlistId'))
      if (!p) return fail(70, 'Playlist not found')
      if (q.get('name') !== null) p.name = q.get('name') as string
      if (q.get('comment') !== null) p.comment = q.get('comment') as string
      if (q.get('public') !== null) p.public = q.get('public') === 'true'
      const remove = new Set(q.getAll('songIndexToRemove').map(Number))
      p.songIds = p.songIds.filter((_, i) => !remove.has(i))
      p.songIds.push(...q.getAll('songIdToAdd'))
      p.changed = new Date().toISOString()
      library.saveUser()
      return ok()
    },
    deletePlaylist: (q) => {
      library.user.playlists = library.user.playlists.filter(
        (x) => x.id !== q.get('id'),
      )
      library.saveUser()
      return ok()
    },

    getPlayQueue: () => {
      const pq = library.user.playQueue
      if (!pq) return ok()
      return ok({
        playQueue: {
          current: pq.current,
          position: pq.position,
          changed: pq.changed,
          changedBy: 'ClearPlay',
          username: LOCAL_USER,
          entry: pq.ids
            .map((id) => library.tracks.get(id))
            .filter(Boolean)
            .map((t) => library.song(t as LocalTrack)),
        },
      })
    },
    savePlayQueue: (q) => {
      library.user.playQueue = {
        ids: q.getAll('id'),
        current: q.get('current') ?? undefined,
        position: num(q, 'position', 0),
        changed: new Date().toISOString(),
      }
      library.saveUser()
      return ok()
    },

    getLyrics: async (q) => {
      const artist = (q.get('artist') ?? '').toLowerCase()
      const title = (q.get('title') ?? '').toLowerCase()
      const t = songs().find(
        (x) =>
          x.title.toLowerCase() === title &&
          (!artist || x.artist.toLowerCase() === artist),
      )
      const lyrics = t ? await readLyrics(t) : null
      const text = lyrics?.lines.map((l) => l.value).join('\n') ?? ''
      return ok({
        lyrics: { artist: t?.artist ?? '', title: t?.title ?? '', value: text },
      })
    },
    getLyricsBySongId: async (q) => {
      const t = library.tracks.get(q.get('id') ?? '')
      const lyrics = t ? await readLyrics(t) : null
      return ok({
        lyricsList: {
          structuredLyrics: lyrics?.lines.length
            ? [
                {
                  displayArtist: t?.artist,
                  displayTitle: t?.title,
                  lang: 'xxx',
                  synced: lyrics.synced,
                  line: lyrics.lines,
                },
              ]
            : [],
        },
      })
    },

    getInternetRadioStations: () =>
      ok({
        internetRadioStations: { internetRadioStation: library.user.radios },
      }),
    createInternetRadioStation: (q) => {
      library.user.radios.push({
        id: hashId('rd', `${Date.now()}${Math.random()}`),
        name: q.get('name') ?? '',
        streamUrl: q.get('streamUrl') ?? '',
        homePageUrl: q.get('homepageUrl') ?? undefined,
      })
      library.saveUser()
      return ok()
    },
    updateInternetRadioStation: (q) => {
      const r = library.user.radios.find((x) => x.id === q.get('id'))
      if (r) {
        r.name = q.get('name') ?? r.name
        r.streamUrl = q.get('streamUrl') ?? r.streamUrl
        r.homePageUrl = q.get('homepageUrl') ?? r.homePageUrl
        library.saveUser()
      }
      return ok()
    },
    deleteInternetRadioStation: (q) => {
      library.user.radios = library.user.radios.filter(
        (x) => x.id !== q.get('id'),
      )
      library.saveUser()
      return ok()
    },

    getScanStatus: () =>
      ok({
        scanStatus: {
          scanning: library.scanning,
          count: library.scanning ? library.scanned : library.tracks.size,
        },
      }),
    startScan: () => {
      rescan()
      return ok({ scanStatus: { scanning: true, count: 0 } })
    },
  }

  function list2(q: Params, key: string) {
    let list = albums()
    switch (q.get('type')) {
      case 'random':
        list = shuffle(list)
        break
      case 'newest':
        list.sort((a, b) => b.created - a.created)
        break
      case 'recent':
        list = list
          .filter((a) => lastPlayed(a))
          .sort((a, b) => lastPlayed(b).localeCompare(lastPlayed(a)))
        break
      case 'frequent':
        list = list
          .filter((a) => playCount(a) > 0)
          .sort((a, b) => playCount(b) - playCount(a))
        break
      case 'highest':
        list = list
          .filter((a) => library.user.ratings[a.id])
          .sort(
            (a, b) =>
              (library.user.ratings[b.id] ?? 0) -
              (library.user.ratings[a.id] ?? 0),
          )
        break
      case 'alphabeticalByArtist':
        list.sort(
          (a, b) =>
            a.artist.localeCompare(b.artist) || a.name.localeCompare(b.name),
        )
        break
      case 'starred':
        list = list.filter((a) => library.user.starred[a.id])
        break
      case 'byYear': {
        const from = num(q, 'fromYear', 0)
        const to = num(q, 'toYear', 9999)
        const [lo, hi] = from <= to ? [from, to] : [to, from]
        list = list.filter((a) => (a.year ?? 0) >= lo && (a.year ?? 0) <= hi)
        list.sort(
          (a, b) => (from <= to ? 1 : -1) * ((a.year ?? 0) - (b.year ?? 0)),
        )
        break
      }
      case 'byGenre': {
        const genre = q.get('genre') ?? ''
        list = list.filter((a) => a.genres.includes(genre))
        break
      }
      default:
        list.sort((a, b) => a.name.localeCompare(b.name))
    }
    return ok({
      [key]: {
        album: page(list, q, 'size', 'offset', 10).map((a) => library.album(a)),
      },
    })
  }

  function searchResult(q: Params, key: string) {
    const raw = (q.get('query') ?? '')
      .replace(/^"+|"+$/g, '')
      .trim()
      .toLowerCase()
    const words = raw.split(/\s+/).filter(Boolean)
    const all = words.length === 0
    const artistList = [...library.artists.values()]
      .filter((a) => a.albums.length && (all || matches(a.name, words)))
      .sort((a, b) => a.name.localeCompare(b.name))
    const albumList = albums()
      .filter((a) => all || matches(`${a.name} ${a.artist}`, words))
      .sort((a, b) => a.name.localeCompare(b.name))
    const songList = songs()
      .filter((t) => all || matches(`${t.title} ${t.artist} ${t.album}`, words))
      .sort((a, b) => a.title.localeCompare(b.title))
    return ok({
      [key]: {
        artist: page(artistList, q, 'artistCount', 'artistOffset', 20).map(
          (a) => library.artist(a),
        ),
        album: page(albumList, q, 'albumCount', 'albumOffset', 20).map((a) =>
          library.album(a),
        ),
        song: page(songList, q, 'songCount', 'songOffset', 20).map((t) =>
          library.song(t),
        ),
      },
    })
  }

  function starred(key: string) {
    const s = library.user.starred
    return ok({
      [key]: {
        artist: [...library.artists.values()]
          .filter((a) => s[a.id])
          .map((a) => library.artist(a)),
        album: albums()
          .filter((a) => s[a.id])
          .map((a) => library.album(a)),
        song: songs()
          .filter((t) => s[t.id])
          .sort((a, b) => (s[b.id] ?? '').localeCompare(s[a.id] ?? ''))
          .map((t) => library.song(t)),
      },
    })
  }

  /** No audio analysis here: same artist first, then the same genre. */
  function similar(q: Params) {
    const id = q.get('id') ?? ''
    const count = num(q, 'count', 50)
    const seed = library.tracks.get(id)
    const artist = library.artists.get(id)
    const names = new Set(
      (seed?.artists ?? (artist ? [artist.name] : [])).map((n) =>
        n.toLowerCase(),
      ),
    )
    const genres = new Set(
      seed?.genres ?? artist?.albums.flatMap((a) => a.genres) ?? [],
    )
    const pool = songs().filter((t) => t.id !== id)
    const sameArtist = shuffle(
      pool.filter((t) => t.artists.some((a) => names.has(a.toLowerCase()))),
    )
    const sameGenre = shuffle(
      pool.filter(
        (t) => !sameArtist.includes(t) && t.genres.some((g) => genres.has(g)),
      ),
    )
    return [...sameArtist, ...sameGenre]
      .slice(0, count)
      .map((t) => library.song(t))
  }

  // ---------------- lyrics ----------------
  async function readLyrics(t: LocalTrack) {
    const base = t.path.slice(0, t.path.length - path.extname(t.path).length)
    for (const ext of ['.lrc', '.LRC', '.txt']) {
      try {
        const text = await fs.readFile(base + ext, 'utf8')
        return parseLyrics(text)
      } catch {
        // try the next one
      }
    }
    if (!t.hasEmbeddedLyrics) return null
    try {
      const meta = await parseFile(t.path, {
        skipCovers: true,
        duration: false,
      })
      const tag =
        meta.common.lyrics?.find((l) => l.syncText?.length) ??
        meta.common.lyrics?.[0]
      if (!tag) return null
      if (tag.syncText?.length) {
        return {
          synced: true,
          lines: tag.syncText.map((l) => ({
            start: l.timestamp ?? 0,
            value: l.text,
          })),
        }
      }
      return tag.text ? parseLyrics(tag.text) : null
    } catch {
      return null
    }
  }

  // ---------------- cover art ----------------
  async function coverFor(id: string): Promise<Buffer | null> {
    let album = library.albums.get(id)
    if (!album) {
      const artist = library.artists.get(id)
      album = artist?.albums[0]
    }
    const track = album?.tracks[0] ?? library.tracks.get(id)
    if (!track) return null
    if (!album) album = library.albumOf(track)

    // A cover image in the album folder wins over embedded art.
    const dir = path.dirname(track.path)
    try {
      const files = await fs.readdir(dir)
      const pick =
        files.find((f) =>
          /^(cover|folder|front|album)\.(jpe?g|png|webp)$/i.test(f),
        ) ?? files.find((f) => /\.(jpe?g|png|webp)$/i.test(f))
      if (pick) return await fs.readFile(path.join(dir, pick))
    } catch {
      // fall through to embedded art
    }
    for (const t of album?.tracks ?? [track]) {
      try {
        const meta = await parseFile(t.path, {
          skipCovers: false,
          duration: false,
        })
        const pic = meta.common.picture?.[0]
        if (pic) return Buffer.from(pic.data)
      } catch {
        // next track
      }
    }
    return null
  }

  async function cover(id: string, size: number): Promise<Buffer | null> {
    const key = `${id}:${size}`
    const cached = coverCache.get(key)
    if (cached) return cached
    const original = await coverFor(id)
    if (!original) return null
    let out = original
    if (size > 0) {
      const img = nativeImage.createFromBuffer(original)
      if (!img.isEmpty()) {
        const { width } = img.getSize()
        out =
          width > size
            ? img.resize({ width: size, quality: 'good' }).toJPEG(88)
            : img.toJPEG(92)
      }
    }
    if (coverCache.size > 600)
      coverCache.delete(coverCache.keys().next().value as string)
    coverCache.set(key, out)
    return out
  }

  // ---------------- http ----------------
  async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', '*')
    res.setHeader(
      'Access-Control-Expose-Headers',
      'Content-Range, Content-Length, x-total-count',
    )
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end()
      return
    }
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const match = url.pathname.match(/^\/rest\/([A-Za-z0-9]+)(?:\.view)?$/)
    if (!match) {
      res.writeHead(404).end()
      return
    }
    const name = match[1]
    const q = url.searchParams

    // OpenSubsonic: the extensions list is public (clients read it before login).
    if (!authorised(q) && name !== 'getOpenSubsonicExtensions') {
      sendJson(res, fail(40, 'Wrong username or password'))
      return
    }

    if (name === 'stream' || name === 'download') {
      const t = library.tracks.get(q.get('id') ?? '')
      if (!t) {
        res.writeHead(404).end()
        return
      }
      await sendFile(req, res, t)
      return
    }
    if (name === 'getCoverArt') {
      const img = await cover(q.get('id') ?? '', num(q, 'size', 0))
      if (!img) {
        res.writeHead(404).end()
        return
      }
      res.writeHead(200, {
        'Content-Type': img[0] === 0x89 ? 'image/png' : 'image/jpeg',
        'Content-Length': img.length,
        'Cache-Control': 'max-age=86400',
      })
      res.end(img)
      return
    }

    const fn = api[name]
    if (!fn) {
      sendJson(res, fail(0, `Not available in the local library: ${name}`))
      return
    }
    try {
      sendJson(res, await fn(q))
    } catch (e) {
      sendJson(res, fail(0, String(e)))
    }
  }

  return http.createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500)
      res.end()
    })
  })
}

function sendJson(res: http.ServerResponse, body: Json) {
  const data = Buffer.from(JSON.stringify(body))
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Content-Length': data.length,
  })
  res.end(data)
}

async function sendFile(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  t: LocalTrack,
) {
  let size: number
  try {
    size = (await fs.stat(t.path)).size
  } catch {
    res.writeHead(404).end()
    return
  }
  const type = contentType(t.suffix)
  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/)
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2])
    let end = range[1] && range[2] ? Number(range[2]) : size - 1
    start = Math.max(0, start)
    end = Math.min(end, size - 1)
    if (start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end()
      return
    }
    res.writeHead(206, {
      'Content-Type': type,
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
    })
    createReadStream(t.path, { start, end }).pipe(res)
    return
  }
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': size,
    'Accept-Ranges': 'bytes',
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  createReadStream(t.path).pipe(res)
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** LRC (timed) or plain text into lines; times in milliseconds. */
export function parseLyrics(text: string) {
  const lines: { start?: number; value: string }[] = []
  let synced = false
  for (const raw of text.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:[.:]\d+)?)\]/g)]
    const value = raw.replace(/\[[^\]]*\]/g, '').trim()
    if (stamps.length) {
      synced = true
      for (const m of stamps) {
        const start = Math.round(
          (Number(m[1]) * 60 + Number(m[2].replace(':', '.'))) * 1000,
        )
        lines.push({ start, value })
      }
    } else if (!/^\[[a-z]+:/i.test(raw) && raw.trim()) {
      lines.push({ value: raw.trim() })
    }
  }
  if (synced) {
    const timed = lines.filter((l) => l.start !== undefined)
    timed.sort((a, b) => (a.start ?? 0) - (b.start ?? 0))
    return { synced: true, lines: timed }
  }
  return { synced: false, lines }
}
