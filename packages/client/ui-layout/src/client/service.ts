/**
 * LayoutController: the cross-plugin panel-action face behind ctx.layout.
 * Panel geometry and main-panel selection live in the root layout store;
 * the current-session selection lives with the runtime sessions service, and
 * the per-session active view dissolved into ui-conversation's session store
 * (its only consumer). What remains here is the contract other plugins'
 * apply worlds reach for panel transitions (main-panel selection and sidebar toggle,
 * right-panel show/hide from ui-sidebar-right) — writes stay inside the
 * store's declared action set, shared with the root registration.
 */
import type { BoundActions, HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { createLayoutStore } from './stores.ts'

/** Identity shared by a sidebar panel entry and its main-slot occupant. */
export type MainPanelId = Branded<'MainPanelId'>

/** Root-scoped navigation state exposed to panel-aware components. */
export interface PanelInfo {
  /** Selected global panel; null displays the current Conversation. */
  readonly activePanelId: MainPanelId | null
}

/** The layout store's bound action set (framework-baked, draft params peeled). */
export type PanelActions = BoundActions<ReturnType<typeof createLayoutStore>>

/** Temporary content width suggestion; superseded or manually overridden requests stay inactive. */
export interface RightbarWidthRequest {
  /**
   * Update this suggestion while it remains current.
   * @param width - finite preferred normal right panel width in pixels, subject to frame limits.
   * @throws RangeError for a non-finite width while current; inactive handles remain no-ops.
   */
  update(width: number): void
  /** Release this suggestion if current, restoring the saved user width. */
  dispose(): void
}

/** Panel navigation and geometry actions exposed through ctx.layout. */
export interface ILayout {
  /** Selected central panel from the same root store used by `usePanelInfo`. */
  readonly panelInfo: HostObservable<PanelInfo>
  /**
   * Select a global central panel without changing the current Session.
   * @param panelId - registered main key, or null to show the Conversation.
   * @throws if the selected main key is not registered; preserves the current selection.
   */
  selectPanel(panelId: MainPanelId | null): void
  /**
   * Start an asynchronous navigation, superseding any earlier pending navigation.
   * @returns a signal aborted by the next navigation or layout disposal; check it before committing UI state.
   */
  beginNavigation(): AbortSignal
  /** Toggle the sidebar panel (closed ⟷ contract default width). */
  toggleSidebar(): void
  /**
   * Suggest a normal right panel width without changing the saved user width.
   * The latest request wins; manual resizing invalidates it until a new request.
   * @param width - finite preferred width in pixels, subject to the frame's existing limits.
   * @returns an update/dispose handle; the caller releases it when its content no longer owns the width.
   * @throws RangeError for a non-finite width, preserving the current request and saved user width.
   */
  requestRightbarWidth(width: number): RightbarWidthRequest
  /**
   * Report the right panel's presentation without changing its expanded state.
   * @param track - whether the normal panel width reserves a grid track,
   *   including beneath a fullscreen overlay.
   * @param fullscreen - whether the panel covers the frame and hides its outer
   *   resize handle; independent of the underlying grid track.
   */
  openRightbar(track: boolean, fullscreen: boolean): void
  /** Report the right panel as hidden: no track, no handle. */
  closeRightbar(): void
}

/** Cross-plugin panel-action face (ctx.layout). */
export class LayoutController implements ILayout {
  private navigation = new AbortController()
  private nextWidthRequestId = 0

  /**
   * @param panels - actions of the instance shared with the root entry.
   * @param hasMainPanel - checks the live main-slot registry for a panel id.
   * @param panelInfo - root store's shared central-panel selection source.
   */
  constructor(
    private readonly panels: PanelActions,
    private readonly hasMainPanel: (id: MainPanelId) => boolean,
    readonly panelInfo: HostObservable<PanelInfo>,
  ) {}

  /** Select a global panel or return to the Conversation. */
  selectPanel(panelId: MainPanelId | null): void {
    if (panelId !== null && !this.hasMainPanel(panelId)) {
      throw new Error(`layout.selectPanel: main panel "${panelId}" is not registered`)
    }
    this.navigation.abort()
    this.panels.selectPanel(panelId)
  }

  /** @returns the new pending navigation's cancellation signal. */
  beginNavigation(): AbortSignal {
    this.navigation.abort()
    this.navigation = new AbortController()
    return this.navigation.signal
  }

  /** Invalidate pending navigations and width requests when the layout owner is unloaded. */
  dispose(): void {
    this.navigation.abort()
    this.panels.releaseRightbarWidth()
  }

  /** Toggle the sidebar panel (closed ⟷ contract default width). */
  toggleSidebar(): void {
    this.panels.toggleSidebar()
  }

  /** Request a temporary content width under the frame's normal limits. */
  requestRightbarWidth(width: number): RightbarWidthRequest {
    if (!Number.isFinite(width)) throw new RangeError('layout.requestRightbarWidth: width must be finite')
    const id = ++this.nextWidthRequestId
    this.panels.requestRightbarWidth(id, width)
    return {
      update: (nextWidth) => { this.panels.updateRightbarWidth(id, nextWidth) },
      dispose: () => { this.panels.releaseRightbarWidth(id) },
    }
  }

  /** Report the right panel's track and fullscreen presentation. */
  openRightbar(track: boolean, fullscreen: boolean): void {
    this.panels.openRightbar(track, fullscreen)
  }

  /** Report the right panel as hidden: no track, no handle. */
  closeRightbar(): void {
    this.panels.closeRightbar()
  }
}
