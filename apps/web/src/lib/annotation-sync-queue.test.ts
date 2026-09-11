import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AnnotationSyncQueue, type PendingChange } from './annotation-sync-queue.ts'

function change(id: string, operation: PendingChange['operation'] = 'create', backendId?: string): PendingChange {
  return {
    annotation: { id, imageId: 'image-a', type: 'rectangle', labelId: 'label', x: 1, y: 2, width: 3, height: 4, createdAt: 0, updatedAt: 0 },
    operation, backendId, imageWidth: 100, imageHeight: 100,
  }
}

test('a save acknowledges only the version that was sent', () => {
  const queue = new AnnotationSyncQueue()
  queue.put(change('a', 'update', 'server-a'))
  queue.begin()
  const edited = change('a', 'update', 'server-a')
  edited.annotation.updatedAt = 10
  queue.put(edited)
  queue.put(change('b'))
  queue.acknowledge(['image-a'], {})
  assert.equal(queue.pending.size, 2)
  assert.equal(queue.pending.get('a')?.annotation.updatedAt, 10)
})

test('editing a create in flight becomes an update with its new server ID', () => {
  const queue = new AnnotationSyncQueue()
  queue.put(change('a'))
  queue.begin()
  queue.put(change('a'))
  queue.acknowledge(['image-a'], { a: 'server-a' })
  assert.equal(queue.pending.get('a')?.operation, 'update')
  assert.equal(queue.pending.get('a')?.backendId, 'server-a')
  queue.begin()
  queue.acknowledge(['image-a'], {})
  assert.equal(queue.pending.size, 0)
  // A stale component need not have re-rendered to know this is an update.
  queue.put(change('a'))
  assert.equal(queue.pending.get('a')?.operation, 'update')
})

test('deleting an unsent create cancels it', () => {
  const queue = new AnnotationSyncQueue()
  queue.put(change('a'))
  queue.put(change('a', 'delete'))
  assert.equal(queue.pending.size, 0)
})

test('deleting a create in flight sends a delete after it is acknowledged', () => {
  const queue = new AnnotationSyncQueue()
  queue.put(change('a'))
  queue.begin()
  queue.put(change('a', 'delete'))
  queue.acknowledge(['image-a'], { a: 'server-a' })
  assert.equal(queue.pending.get('a')?.operation, 'delete')
  assert.equal(queue.pending.get('a')?.backendId, 'server-a')
})

test('failed requests and unacknowledged images keep their edits', () => {
  const queue = new AnnotationSyncQueue()
  queue.put(change('a'))
  queue.begin()
  queue.failed()
  assert.equal(queue.pending.size, 1)
  queue.begin()
  queue.acknowledge([], { a: 'server-a' })
  assert.equal(queue.pending.size, 1)
})

test('a delete made during a failed create is resolved after retry', () => {
  const queue = new AnnotationSyncQueue()
  queue.put(change('a'))
  queue.begin()
  queue.put(change('a', 'delete'))
  queue.failed()
  assert.equal(queue.begin()[0].operation, 'create')
  queue.acknowledge(['image-a'], { a: 'server-a' })
  assert.equal(queue.begin()[0].operation, 'delete')
})
