// @vitest-environment jsdom
/** Content width ownership leaves user preferences and superseded handles intact. */
import { describe, expect, it } from 'vitest'
import { LayoutController } from '../src/client/service.ts'
import { createLayoutStore } from '../src/client/stores.ts'

function harness() {
  const instance = createLayoutStore().create()
  const controller = new LayoutController(instance.actions, () => true, {
    getSnapshot: () => instance.getSnapshot().panelInfo,
    subscribe: listener => instance.subscribe(listener),
  })
  return { instance, controller, info: () => instance.getSnapshot().layoutInfo }
}

describe('temporary right panel widths', () => {
  it.each([NaN, Infinity, -Infinity])('rejects non-finite width %s without replacing the current suggestion', (width) => {
    const { instance, controller, info } = harness()
    instance.actions.setRightbar(600)
    const request = controller.requestRightbarWidth(340)
    const current = instance.getSnapshot()
    expect(() => controller.requestRightbarWidth(width)).toThrow(RangeError)
    expect(instance.getSnapshot()).toBe(current)
    expect(() => { request.update(width) }).toThrow(RangeError)
    expect(instance.getSnapshot()).toBe(current)
    request.update(370)
    expect(info()).toMatchObject({ rightbar: 600, rightbarWidthRequest: { width: 370 } })
    request.dispose()
    expect(info()).toMatchObject({ rightbar: 600, rightbarWidthRequest: null })
  })

  it.each(['superseded', 'manual', 'released', 'layout'] as const)(
    'ignores non-finite updates after the request is %s', (invalidation) => {
      const { instance, controller } = harness()
      const request = controller.requestRightbarWidth(340)
      if (invalidation === 'superseded') controller.requestRightbarWidth(440)
      else if (invalidation === 'manual') instance.actions.setRightbar(600)
      else if (invalidation === 'released') request.dispose()
      else controller.dispose()
      const current = instance.getSnapshot()
      for (const width of [NaN, Infinity, -Infinity]) {
        expect(() => { request.update(width) }).not.toThrow()
        expect(instance.getSnapshot()).toBe(current)
      }
    },
  )

  it('keeps the saved width through suggestions, updates, and repeated disposal', () => {
    const { instance, controller, info } = harness()
    instance.actions.setRightbar(600)
    const request = controller.requestRightbarWidth(340)
    expect(info()).toMatchObject({ rightbar: 600, rightbarWidthRequest: { width: 340 } })
    request.update(370)
    expect(info()).toMatchObject({ rightbar: 600, rightbarWidthRequest: { width: 370 } })
    request.dispose()
    const released = instance.getSnapshot()
    request.update(320)
    request.dispose()
    expect(instance.getSnapshot()).toBe(released)
    expect(info()).toMatchObject({ rightbar: 600, rightbarWidthRequest: null })
  })

  it('keeps a newer request when an older handle updates or disposes', () => {
    const { instance, controller, info } = harness()
    const first = controller.requestRightbarWidth(330)
    const second = controller.requestRightbarWidth(440)
    const current = instance.getSnapshot()
    first.update(360)
    first.dispose()
    expect(instance.getSnapshot()).toBe(current)
    second.update(480)
    expect(info()).toMatchObject({ rightbar: null, rightbarWidthRequest: { width: 480 } })
    second.dispose()
    first.update(390)
    expect(info()).toMatchObject({ rightbar: null, rightbarWidthRequest: null })
  })

  it('makes a manual width authoritative until a fresh request claims ownership', () => {
    const { instance, controller, info } = harness()
    const request = controller.requestRightbarWidth(330)
    instance.actions.setRightbar(510)
    const manual = instance.getSnapshot()
    request.update(350)
    request.dispose()
    expect(instance.getSnapshot()).toBe(manual)
    expect(info()).toMatchObject({ rightbar: 510, rightbarWidthRequest: null })
    const next = controller.requestRightbarWidth(390)
    request.update(700)
    request.dispose()
    expect(info()).toMatchObject({ rightbar: 510, rightbarWidthRequest: { width: 390 } })
    next.dispose()
    expect(info()).toMatchObject({ rightbar: 510, rightbarWidthRequest: null })
  })

  it('clears the active suggestion on layout disposal and ignores retained handles', () => {
    const { instance, controller, info } = harness()
    instance.actions.setRightbar(600)
    const request = controller.requestRightbarWidth(350)
    controller.dispose()
    const disposed = instance.getSnapshot()
    request.update(450)
    request.dispose()
    controller.dispose()
    expect(instance.getSnapshot()).toBe(disposed)
    expect(info()).toMatchObject({ rightbar: 600, rightbarWidthRequest: null })
  })
})
