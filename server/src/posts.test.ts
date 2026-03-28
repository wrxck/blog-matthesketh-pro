import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { PostsService } from './posts.js'

const TEST_BASE = join(import.meta.dirname, '../.test-content')
const TEST_DIR = join(TEST_BASE, 'blog')
const TEST_DATA = join(import.meta.dirname, '../.test-data-posts')

describe('PostsService', () => {
  let posts: PostsService

  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true })
    mkdirSync(TEST_DATA, { recursive: true })
    posts = new PostsService(TEST_BASE, TEST_DATA)
  })

  afterEach(() => {
    rmSync(TEST_BASE, { recursive: true, force: true })
    rmSync(TEST_DATA, { recursive: true, force: true })
  })

  it('lists posts from markdown files', async () => {
    writeFileSync(join(TEST_DIR, 'hello.md'), [
      '---',
      'title: "Hello"',
      'description: "A post"',
      'date: 2026-03-21',
      'tags: ["test"]',
      'draft: false',
      '---',
      '',
      'Body text here.',
    ].join('\n'))

    const list = await posts.list()
    expect(list).toHaveLength(1)
    expect(list[0].slug).toBe('hello')
    expect(list[0].title).toBe('Hello')
    expect(list[0].draft).toBe(false)
  })

  it('gets a single post with body', async () => {
    writeFileSync(join(TEST_DIR, 'test-post.md'), [
      '---',
      'title: "Test"',
      'description: "Desc"',
      'date: 2026-03-21',
      'tags: []',
      'draft: true',
      '---',
      '',
      '## Heading',
      '',
      'Some content.',
    ].join('\n'))

    const post = await posts.get('test-post')
    expect(post).not.toBeNull()
    expect(post!.title).toBe('Test')
    expect(post!.body).toContain('## Heading')
    expect(post!.body).toContain('Some content.')
  })

  it('returns null for non-existent post', async () => {
    const post = await posts.get('nope')
    expect(post).toBeNull()
  })

  it('creates a new post', async () => {
    await posts.create({
      slug: 'new-post',
      title: 'New Post',
      description: 'A new one',
      date: '2026-03-28',
      tags: ['test'],
      draft: false,
      body: 'Hello world.',
    })

    const filePath = join(TEST_DIR, 'new-post.md')
    expect(existsSync(filePath)).toBe(true)

    const post = await posts.get('new-post')
    expect(post!.title).toBe('New Post')
    expect(post!.body).toBe('Hello world.')
  })

  it('rejects slugs with path traversal', async () => {
    await expect(posts.create({
      slug: '../evil',
      title: 'Evil',
      description: '',
      date: '2026-03-28',
      tags: [],
      draft: false,
      body: 'pwned',
    })).rejects.toThrow('Invalid slug')
  })

  it('updates an existing post', async () => {
    writeFileSync(join(TEST_DIR, 'existing.md'), [
      '---',
      'title: "Old Title"',
      'description: "Old desc"',
      'date: 2026-03-21',
      'tags: []',
      'draft: true',
      '---',
      '',
      'Old body.',
    ].join('\n'))

    await posts.update('existing', { title: 'New Title', body: 'New body.' })
    const post = await posts.get('existing')
    expect(post!.title).toBe('New Title')
    expect(post!.body).toBe('New body.')
  })

  it('deletes a post', async () => {
    writeFileSync(join(TEST_DIR, 'delete-me.md'), [
      '---',
      'title: "Delete Me"',
      'description: ""',
      'date: 2026-03-28',
      'tags: []',
      'draft: false',
      '---',
      '',
      'Gone.',
    ].join('\n'))

    await posts.delete('delete-me')
    expect(existsSync(join(TEST_DIR, 'delete-me.md'))).toBe(false)
  })

  it('lists posts sorted by date descending', async () => {
    writeFileSync(join(TEST_DIR, 'old.md'), '---\ntitle: "Old"\ndescription: ""\ndate: 2026-01-01\ntags: []\ndraft: false\n---\n\nOld.')
    writeFileSync(join(TEST_DIR, 'new.md'), '---\ntitle: "New"\ndescription: ""\ndate: 2026-03-28\ntags: []\ndraft: false\n---\n\nNew.')

    const list = await posts.list()
    expect(list[0].slug).toBe('new')
    expect(list[1].slug).toBe('old')
  })
})
