import { readdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import matter from 'gray-matter'

export interface PostSummary {
  id: string
  slug: string
  title: string
  description: string
  date: string
  tags: string[]
  draft: boolean
}

export interface PostFull extends PostSummary {
  body: string
}

export interface CreatePostInput {
  slug: string
  title: string
  description: string
  date: string
  tags: string[]
  draft: boolean
  body: string
}

export interface UpdatePostInput {
  title?: string
  description?: string
  date?: string
  tags?: string[]
  draft?: boolean
  body?: string
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function validateSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new Error(`Invalid slug: "${slug}". Must be lowercase alphanumeric with hyphens.`)
  }
}

// UUID <-> slug index
interface PostIndex {
  [uuid: string]: string // uuid -> slug
}

export class PostsService {
  private blogDir: string
  private indexPath: string
  private index: PostIndex | null = null

  constructor(contentDir: string, dataDir: string) {
    this.blogDir = join(contentDir, 'blog')
    this.indexPath = join(dataDir, 'post-index.json')
  }

  private async loadIndex(): Promise<PostIndex> {
    if (this.index !== null) return this.index
    try {
      const raw = await readFile(this.indexPath, 'utf-8')
      this.index = JSON.parse(raw)
      return this.index!
    } catch {
      this.index = {}
      return this.index
    }
  }

  private async saveIndex(): Promise<void> {
    await writeFile(this.indexPath, JSON.stringify(this.index, null, 2), 'utf-8')
  }

  private async getIdForSlug(slug: string): Promise<string> {
    const index = await this.loadIndex()
    // Find existing UUID for this slug
    for (const [uuid, s] of Object.entries(index)) {
      if (s === slug) return uuid
    }
    // Create new UUID mapping
    const uuid = randomUUID()
    index[uuid] = slug
    await this.saveIndex()
    return uuid
  }

  async getSlugById(id: string): Promise<string | null> {
    const index = await this.loadIndex()
    return index[id] || null
  }

  async list(): Promise<PostSummary[]> {
    const files = await readdir(this.blogDir)
    const mdFiles = files.filter((f) => f.endsWith('.md'))

    const posts: PostSummary[] = []
    for (const file of mdFiles) {
      const raw = await readFile(join(this.blogDir, file), 'utf-8')
      const { data } = matter(raw)
      const slug = file.replace(/\.md$/, '')
      const id = await this.getIdForSlug(slug)
      posts.push({
        id,
        slug,
        title: data.title || '',
        description: data.description || '',
        date: data.date ? String(data.date instanceof Date ? data.date.toISOString().split('T')[0] : data.date) : '',
        tags: Array.isArray(data.tags) ? data.tags : [],
        draft: Boolean(data.draft),
      })
    }

    posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    return posts
  }

  async get(slug: string): Promise<PostFull | null> {
    validateSlug(slug)
    const filePath = join(this.blogDir, `${slug}.md`)
    let raw: string
    try {
      raw = await readFile(filePath, 'utf-8')
    } catch {
      return null
    }
    const { data, content } = matter(raw)
    const id = await this.getIdForSlug(slug)
    return {
      id,
      slug,
      title: data.title || '',
      description: data.description || '',
      date: data.date ? String(data.date instanceof Date ? data.date.toISOString().split('T')[0] : data.date) : '',
      tags: Array.isArray(data.tags) ? data.tags : [],
      draft: Boolean(data.draft),
      body: content.trim(),
    }
  }

  async create(input: CreatePostInput): Promise<void> {
    validateSlug(input.slug)
    const filePath = join(this.blogDir, `${input.slug}.md`)
    const content = matter.stringify(input.body + '\n', {
      title: input.title,
      description: input.description,
      date: input.date,
      tags: input.tags,
      draft: input.draft,
    })
    await writeFile(filePath, content, 'utf-8')
  }

  async update(slug: string, input: UpdatePostInput): Promise<void> {
    validateSlug(slug)
    const existing = await this.get(slug)
    if (!existing) throw new Error(`Post not found: ${slug}`)

    const merged = {
      title: input.title ?? existing.title,
      description: input.description ?? existing.description,
      date: input.date ?? existing.date,
      tags: input.tags ?? existing.tags,
      draft: input.draft ?? existing.draft,
    }
    const body = input.body ?? existing.body
    const content = matter.stringify(body + '\n', merged)
    await writeFile(join(this.blogDir, `${slug}.md`), content, 'utf-8')
  }

  async delete(slug: string): Promise<void> {
    validateSlug(slug)
    await unlink(join(this.blogDir, `${slug}.md`))
  }
}
